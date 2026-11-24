<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Notification;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\WorkflowInstance;
use App\Support\ApiPresenter;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    // --- Org chart ---
    public function orgChart()
    {
        // Scoped like every other controller: HR sees all, managers see
        // their department/subtree, others see only themselves.
        $employees = $this->scopeEmployees(Employee::with('department')->orderBy('id'))->get();
        $byManager = [];
        foreach ($employees as $e) {
            $byManager[$e->manager_id ?? 0][] = $e;
        }

        $cycleDetected = false;
        $visited = [];

        $build = function ($employee, array $path) use (&$build, $byManager, &$cycleDetected, &$visited) {
            if (in_array($employee->id, $path, true)) {
                $cycleDetected = true;
                return null; // never recurse infinitely
            }
            $visited[$employee->id] = true;
            $children = [];
            foreach ($byManager[$employee->id] ?? [] as $child) {
                $node = $build($child, [...$path, $employee->id]);
                if ($node) {
                    $children[] = $node;
                }
            }

            return [
                'employeeId' => $employee->id,
                'name' => $employee->fullName(),
                'jobTitle' => $employee->job_title,
                'departmentId' => $employee->department_id,
                'department' => $employee->department?->name,
                'positionId' => $employee->position_id,
                'position' => $employee->position_title,
                'status' => $employee->status,
                'children' => $children,
            ];
        };

        $roots = [];
        foreach ($byManager[0] ?? [] as $root) {
            $node = $build($root, []);
            if ($node) {
                $roots[] = $node;
            }
        }
        // Employees in a cycle (or orphaned by one) become separate roots.
        foreach ($employees as $e) {
            if (! isset($visited[$e->id])) {
                $cycleDetected = true;
                $node = $build($e, []);
                if ($node) {
                    $roots[] = $node;
                }
            }
        }

        return response()->json(['data' => $roots, 'meta' => ['cycleDetected' => $cycleDetected]]);
    }

    // --- HR dashboard statistics (mock-adapter shape, contract §3.10) ---
    public function statistics()
    {
        // Scoped like every other controller (was unscoped: any logged-in
        // user could pull every employee, leave and case). Response shape
        // is unchanged; HR still sees everything.
        $employees = $this->scopeEmployees(Employee::with(['department', 'manager', 'documents'])->orderBy('id'))->get();
        $employeeIds = $employees->pluck('id')->all();
        $onboarding = OnboardingCase::with('tasks')->whereIn('employee_id', $employeeIds)->orderByDesc('created_at')->get();
        $offboarding = OffboardingCase::whereIn('employee_id', $employeeIds)->orderByDesc('created_at')->get();
        $leaves = LeaveRequest::with(['employee', 'leaveType', 'backupEmployee'])->whereIn('employee_id', $employeeIds)->orderByDesc('submitted_at')->get();
        $holidays = Holiday::orderBy('date')->get();

        $metrics = [
            'totalEmployees' => $employees->count(),
            'activeEmployees' => $employees->where('status', 'Active')->count(),
            'onLeaveCount' => $employees->where('status', 'On Leave')->count(),
            'activeOnboarding' => $onboarding->filter(fn ($c) => $c->status !== 'Completed' && $c->stage !== 'Completed')->count(),
            'onboardingAtRisk' => $onboarding->where('status', 'At risk')->count(),
            'activeOffboarding' => $offboarding->filter(fn ($c) => $c->status !== 'Completed' && $c->stage !== 'Completed')->count(),
            'offboardingOverdue' => $offboarding->where('status', 'Overdue')->count(),
            'leavePending' => $leaves->where('status', 'pending')->count(),
        ];

        return response()->json([
            'metrics' => $metrics,
            'employees' => $employees->map(fn ($e) => ApiPresenter::employee($e))->values()->all(),
            'onboardingRequests' => $onboarding->map(fn ($c) => $this->onboardingCamel($c))->values()->all(),
            'offboardingRequests' => $offboarding->map(fn ($c) => $this->offboardingCamel($c))->values()->all(),
            'leaveRequests' => $leaves->map(fn ($r) => $this->leaveCamel($r))->values()->all(),
            'holidays' => $holidays->map(fn ($h) => [
                'id' => $h->id, 'name' => $h->name, 'nameKey' => $h->name_key,
                'date' => $h->date?->toDateString(), 'days' => $h->days,
                'recurring' => (bool) $h->recurring, 'type' => $h->type,
                'country' => $h->country, 'site' => $h->site,
            ])->values()->all(),
        ]);
    }

    // --- Analytics overview ---
    public function analytics(Request $request)
    {
        $from = $request->query('from') ?: now()->startOfYear()->toDateString();
        $to = $request->query('to') ?: now()->toDateString();
        $departmentId = $request->query('departmentId');
        $location = $request->query('location');
        $employmentStatus = $request->query('employmentStatus');

        $empQuery = $this->scopeEmployees(Employee::query());
        if ($departmentId) {
            $empQuery->where('department_id', $departmentId);
        }
        if ($location) {
            $empQuery->where('location', $location);
        }
        if ($employmentStatus) {
            $empQuery->where('status', $employmentStatus);
        }
        $employees = $empQuery->get();
        $employeeIds = $employees->pluck('id')->all();

        $leaves = LeaveRequest::whereIn('employee_id', $employeeIds)
            ->whereBetween('start_date', [$from, $to])->get();
        $onboarding = OnboardingCase::whereIn('employee_id', $employeeIds)->get();
        $offboarding = OffboardingCase::whereIn('employee_id', $employeeIds)->get();
        $workflows = WorkflowInstance::whereBetween('submitted_at', [$from, $to])->get();

        $deptDist = $employees->groupBy(fn ($e) => $e->department?->name ?? 'Unassigned')
            ->map(fn ($g, $name) => ['name' => $name, 'total' => $g->count()])->values()->all();
        $statusDist = $employees->groupBy('status')
            ->map(fn ($g, $s) => ['status' => $s, 'total' => $g->count()])->values()->all();

        // Headcount trend over the same scoped/filtered set as the rest
        // of this response (previously counted every employee in the DB).
        $trend = [];
        $cursor = Carbon::parse($from)->startOfMonth();
        $end = Carbon::parse($to)->startOfMonth();
        while ($cursor->lte($end)) {
            $monthEnd = $cursor->copy()->endOfMonth();
            $trend[] = [
                'month' => $cursor->format('Y-m'),
                'total' => $employees->filter(fn ($e) => $e->joined_at && Carbon::parse($e->joined_at)->lte($monthEnd))->count(),
            ];
            $cursor->addMonth();
        }

        $leaveByType = $leaves->groupBy('leave_type_id')->map->count()->all();
        $approvedDays = (float) $leaves->where('status', 'approved')->sum('duration');
        $totalDays = (float) $leaves->sum('duration');

        $onboardingTasks = $onboarding->flatMap(fn ($c) => $c->tasks);
        $offReasons = $offboarding->groupBy('reason')
            ->map(fn ($g, $r) => ['reason' => $r ?: 'Unknown', 'total' => $g->count()])->values()->all();

        $wfByStatus = $workflows->groupBy('status')->map->count()->all();
        $completed = $workflows->whereNotNull('completed_at');
        $avgHours = null;
        if ($completed->count() > 0) {
            $hours = $completed->map(fn ($w) => Carbon::parse($w->submitted_at)->diffInHours(Carbon::parse($w->completed_at)))->all();
            $avgHours = round(array_sum($hours) / count($hours), 1);
        }

        return response()->json([
            'period' => ['from' => $from, 'to' => $to, 'timezone' => config('app.timezone')],
            'scope' => ['employeeCount' => $employees->count()],
            'workforce' => [
                'headcount' => $employees->count(),
                'active' => $employees->where('status', 'Active')->count(),
                'onLeave' => $employees->where('status', 'On Leave')->count(),
                'newHires' => $employees->whereBetween('joined_at', [$from, $to])->count(),
                'departures' => $offboarding->where('status', 'Completed')->count(),
                'departmentDistribution' => $deptDist,
                'statusDistribution' => $statusDist,
                'headcountTrend' => $trend,
            ],
            'leave' => [
                'byStatus' => $leaves->groupBy('status')->map->count()->all(),
                'byType' => $leaveByType,
                'monthlyTrend' => $leaves->groupBy(fn ($l) => Carbon::parse($l->start_date)->format('Y-m'))
                    ->map(fn ($g, $m) => ['month' => $m, 'days' => (float) $g->sum('duration'), 'requests' => $g->count()])->values()->all(),
                'approvedDays' => $approvedDays,
                'absenceRate' => $totalDays > 0 ? round($approvedDays / max(1, $employees->count() * 22) * 100, 2) : null,
                'upcomingAbsences' => LeaveRequest::whereIn('employee_id', $employeeIds)->where('start_date', '>', $to)->where('status', 'approved')->count(),
            ],
            'onboarding' => [
                'byStatus' => $onboarding->groupBy('status')->map->count()->all(),
                'active' => $onboarding->filter(fn ($c) => $c->status !== 'Completed')->count(),
                'completed' => $onboarding->where('status', 'Completed')->count(),
                'completionRate' => $onboarding->count() > 0 ? round($onboarding->where('status', 'Completed')->count() / $onboarding->count() * 100, 1) : null,
                'overdueTasks' => $onboardingTasks->where('done', false)->filter(fn ($t) => $t->due_date && $t->due_date->isPast())->count(),
            ],
            'offboarding' => [
                'byStatus' => $offboarding->groupBy('status')->map->count()->all(),
                'completed' => $offboarding->where('status', 'Completed')->count(),
                'completionRate' => $offboarding->count() > 0 ? round($offboarding->where('status', 'Completed')->count() / $offboarding->count() * 100, 1) : null,
                'reasons' => $offReasons,
                'handoverProgress' => $offboarding->count() > 0 ? round($offboarding->avg('progress'), 1) : null,
            ],
            'workflow' => [
                'byStatus' => $wfByStatus,
                'approvalRate' => $workflows->count() > 0 ? round(($wfByStatus['approved'] ?? 0) / $workflows->count() * 100, 1) : null,
                'rejectionRate' => $workflows->count() > 0 ? round(($wfByStatus['rejected'] ?? 0) / $workflows->count() * 100, 1) : null,
                'averageCompletionHours' => $avgHours,
                'overdueSteps' => null,
            ],
            'limitations' => [
                'payroll' => 'Payroll module has no API surface.',
                'overdueSteps' => 'Step-level due dates are not modeled; overdueSteps is null.',
            ],
        ]);
    }

    // --- camelCase shapes for the dashboard arrays (contract §3.10) ---
    private function leaveCamel(LeaveRequest $r): array
    {
        return [
            'id' => (string) $r->id,
            'userId' => $r->employee_id,
            'employee' => $r->employee?->fullName(),
            'typeId' => $r->leave_type_id,
            'type' => $r->leaveType?->name_key,
            'start' => $r->start_date?->toDateString(),
            'end' => $r->end_date?->toDateString(),
            'fromHalf' => $r->from_half,
            'toHalf' => $r->to_half,
            'duration' => (float) $r->duration,
            'backup' => $r->backupEmployee?->fullName(),
            'backupUserId' => $r->backup_employee_id,
            'note' => $r->note,
            'status' => $r->status,
            'submittedAt' => $r->submitted_at?->toISOString(),
        ];
    }

    private function onboardingCamel(OnboardingCase $c): array
    {
        return [
            'id' => (string) $c->id,
            'employeeId' => $c->employee_id,
            'employeeName' => $c->employee_name,
            'position' => $c->position,
            'department' => $c->department,
            'startDate' => $c->start_date?->toDateString(),
            'stage' => $c->stage,
            'assignee' => $c->assignee,
            'progress' => $c->progress,
            'status' => $c->status,
            'approvalStatus' => $c->approval_status,
            'tasks' => $c->tasks->map(fn ($t) => [
                'id' => $t->id, 'labelKey' => $t->label_key, 'done' => (bool) $t->done,
                'dueDate' => $t->due_date?->toDateString(), 'employeeVisible' => (bool) $t->employee_visible,
            ])->values()->all(),
        ];
    }

    private function offboardingCamel(OffboardingCase $c): array
    {
        return [
            'id' => (string) $c->id,
            'employeeId' => $c->employee_id,
            'employeeName' => $c->employee_name,
            'exitDate' => $c->exit_date?->toDateString(),
            'reason' => $c->reason,
            'replacement' => $c->replacement,
            'stage' => $c->stage,
            'progress' => $c->progress,
            'status' => $c->status,
            'approvalStatus' => $c->approval_status,
        ];
    }
}
