<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\WorkflowInstance;
use App\Services\EmployeeVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function __construct(
        private readonly EmployeeVisibility $employeeVisibility
    ) {}

    public function overview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => 'nullable|date',
            'to' => 'nullable|date|after_or_equal:from',
            'departmentId' => 'nullable|exists:departments,id',
            'location' => 'nullable|string',
            'employmentStatus' => 'nullable|string',
        ]);

        $user = $request->user();
        $from = $validated['from'] ?? now()->startOfYear()->toDateString();
        $to = $validated['to'] ?? now()->toDateString();
        $timezone = $user->timezone ?? config('app.timezone');

        // Apply RBAC employee scope
        $employeeQuery = $this->employeeVisibility->query($user);

        // Apply additional filters
        if (!empty($validated['departmentId'])) {
            $employeeQuery->where('department_id', $validated['departmentId']);
        }
        if (!empty($validated['location'])) {
            $employeeQuery->where('location', $validated['location']);
        }
        if (!empty($validated['employmentStatus'])) {
            $employeeQuery->where('status', $validated['employmentStatus']);
        }

        $scopedEmployeeIds = $employeeQuery->pluck('id')->toArray();
        $employeeCount = count($scopedEmployeeIds);

        return response()->json([
            'period' => [
                'from' => $from,
                'to' => $to,
                'timezone' => $timezone,
            ],
            'scope' => [
                'employeeCount' => $employeeCount,
            ],
            'workforce' => $this->calculateWorkforceMetrics($scopedEmployeeIds, $from, $to),
            'leave' => $this->calculateLeaveMetrics($scopedEmployeeIds, $from, $to),
            'onboarding' => $this->calculateOnboardingMetrics($scopedEmployeeIds, $from, $to),
            'offboarding' => $this->calculateOffboardingMetrics($scopedEmployeeIds, $from, $to),
            'workflow' => $this->calculateWorkflowMetrics($user, $scopedEmployeeIds, $from, $to),
            'tenure' => $this->calculateTenureMetrics($scopedEmployeeIds),
            'gender' => $this->calculateGenderMetrics($scopedEmployeeIds),
            'hires' => $this->calculateHiresMetrics($scopedEmployeeIds, $from, $to),
            'lifecycle' => $this->calculateLifecycleMetrics($scopedEmployeeIds, $from, $to),
            'operations' => $this->calculateOperationsMetrics($scopedEmployeeIds, $from, $to),
            'limitations' => $this->detectLimitations($employeeCount),
        ]);
    }

    private function calculateWorkforceMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return $this->emptyWorkforceMetrics();
        }

        $employees = Employee::query()
            ->whereIn('id', $employeeIds)
            ->withTrashed()
            ->get();

        $active = $employees->whereNull('deleted_at')->where('status', 'Active')->count();
        $onLeave = $employees->whereNull('deleted_at')->where('status', 'On Leave')->count();
        
        $newHires = $employees->filter(function ($emp) use ($from, $to) {
            return $emp->joined_at 
                && $emp->joined_at->toDateString() >= $from 
                && $emp->joined_at->toDateString() <= $to;
        })->count();

        $departures = $employees->filter(function ($emp) use ($from, $to) {
            return $emp->deleted_at 
                && $emp->deleted_at->toDateString() >= $from 
                && $emp->deleted_at->toDateString() <= $to;
        })->count();

        // Department distribution (active employees only)
        $departmentDistribution = Employee::query()
            ->whereIn('employees.id', $employeeIds)
            ->whereNull('employees.deleted_at')
            ->select('departments.name', DB::raw('COUNT(*) as total'))
            ->join('departments', 'employees.department_id', '=', 'departments.id')
            ->groupBy('departments.id', 'departments.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn($row) => ['name' => $row->name, 'total' => (int) $row->total])
            ->toArray();

        // Status distribution
        $statusDistribution = Employee::query()
            ->whereIn('employees.id', $employeeIds)
            ->whereNull('employees.deleted_at')
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->orderByDesc('total')
            ->get()
            ->map(fn($row) => ['status' => $row->status ?? 'Unknown', 'total' => (int) $row->total])
            ->toArray();

        // Monthly headcount trend
        $headcountTrend = $this->calculateMonthlyHeadcountTrend($employeeIds, $from, $to);

        return [
            'headcount' => $employees->whereNull('deleted_at')->count(),
            'active' => $active,
            'onLeave' => $onLeave,
            'newHires' => $newHires,
            'departures' => $departures > 0 ? $departures : null,
            'departmentDistribution' => $departmentDistribution,
            'statusDistribution' => $statusDistribution,
            'headcountTrend' => $headcountTrend,
        ];
    }

    private function calculateMonthlyHeadcountTrend(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return [];
        }

        $employees = Employee::query()
            ->whereIn('id', $employeeIds)
            ->withTrashed()
            ->get();

        $start = \Carbon\Carbon::parse($from)->startOfMonth();
        $end = \Carbon\Carbon::parse($to)->endOfMonth();
        $trend = [];

        $current = $start->copy();
        while ($current <= $end) {
            $monthEnd = $current->copy()->endOfMonth();
            
            $headcount = $employees->filter(function ($emp) use ($monthEnd) {
                $joinedBefore = $emp->joined_at && $emp->joined_at <= $monthEnd;
                $activeAtMonth = !$emp->deleted_at || $emp->deleted_at > $monthEnd;
                return $joinedBefore && $activeAtMonth;
            })->count();

            $trend[] = [
                'month' => $current->format('Y-m'),
                'total' => $headcount,
            ];

            $current->addMonth();
        }

        return $trend;
    }

    private function calculateLeaveMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return $this->emptyLeaveMetrics();
        }

        $leaves = LeaveRequest::query()
            ->whereIn('employee_id', $employeeIds)
            ->whereBetween('start_date', [$from, $to])
            ->with('leaveType')
            ->get();

        $byStatus = $leaves->groupBy('status')->map->count()->toArray();
        
        $byType = $leaves->groupBy(fn($leave) => $leave->leaveType->name_key ?? 'Unknown')
            ->map->count()
            ->toArray();

        // Monthly trend
        $monthlyTrend = $this->calculateMonthlyLeaveTrend($employeeIds, $from, $to);

        $approvedLeaves = $leaves->where('status', 'approved');
        $approvedDays = $approvedLeaves->sum('duration');

        // Absence rate: approved leave days / (working days * active employees)
        $activeEmployees = Employee::whereIn('id', $employeeIds)->whereNull('deleted_at')->count();
        $workingDays = $this->calculateWorkingDays($from, $to);
        $absenceRate = ($activeEmployees > 0 && $workingDays > 0) 
            ? round(($approvedDays / ($workingDays * $activeEmployees)) * 100, 2)
            : null;

        // Upcoming absences (approved leaves starting after today)
        $upcomingAbsences = LeaveRequest::query()
            ->whereIn('employee_id', $employeeIds)
            ->where('status', 'approved')
            ->where('start_date', '>', now()->toDateString())
            ->count();

        return [
            'byStatus' => $byStatus,
            'byType' => $byType,
            'monthlyTrend' => $monthlyTrend,
            'approvedDays' => (int) $approvedDays,
            'absenceRate' => $absenceRate,
            'upcomingAbsences' => $upcomingAbsences,
        ];
    }

    private function calculateMonthlyLeaveTrend(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return [];
        }

        $leaves = LeaveRequest::query()
            ->whereIn('employee_id', $employeeIds)
            ->whereBetween('start_date', [$from, $to])
            ->where('status', 'approved')
            ->get();

        $start = \Carbon\Carbon::parse($from)->startOfMonth();
        $end = \Carbon\Carbon::parse($to)->endOfMonth();
        $trend = [];

        $current = $start->copy();
        while ($current <= $end) {
            $monthStart = $current->copy()->startOfMonth()->toDateString();
            $monthEnd = $current->copy()->endOfMonth()->toDateString();

            $monthLeaves = $leaves->filter(function ($leave) use ($monthStart, $monthEnd) {
                return $leave->start_date->toDateString() >= $monthStart 
                    && $leave->start_date->toDateString() <= $monthEnd;
            });

            $trend[] = [
                'month' => $current->format('Y-m'),
                'days' => (int) $monthLeaves->sum('duration'),
                'requests' => $monthLeaves->count(),
            ];

            $current->addMonth();
        }

        return $trend;
    }

    private function calculateOnboardingMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return $this->emptyOnboardingMetrics();
        }

        $cases = OnboardingCase::query()
            ->whereIn('employee_id', $employeeIds)
            ->whereBetween('start_date', [$from, $to])
            ->get();

        $byStatus = $cases->groupBy('status')->map->count()->toArray();
        $active = $cases->where('status', 'active')->count();
        $completed = $cases->where('status', 'completed')->count();
        
        $completionRate = $cases->count() > 0 
            ? round(($completed / $cases->count()) * 100, 2)
            : null;

        // Overdue tasks
        $overdueTasks = OnboardingCase::query()
            ->whereIn('employee_id', $employeeIds)
            ->where('status', 'active')
            ->whereHas('tasks', function ($query) {
                $query->where('due_date', '<', now()->toDateString())
                    ->where('status', '!=', 'completed');
            })
            ->with('tasks')
            ->get()
            ->flatMap->tasks
            ->where('status', '!=', 'completed')
            ->where('due_date', '<', now()->toDateString())
            ->count();

        return [
            'byStatus' => $byStatus,
            'active' => $active,
            'completed' => $completed,
            'completionRate' => $completionRate,
            'overdueTasks' => $overdueTasks,
        ];
    }

    private function calculateOffboardingMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return $this->emptyOffboardingMetrics();
        }

        $cases = OffboardingCase::query()
            ->whereIn('employee_id', $employeeIds)
            ->whereBetween('exit_date', [$from, $to])
            ->get();

        $byStatus = $cases->groupBy('status')->map->count()->toArray();
        $completed = $cases->where('status', 'completed')->count();
        
        $completionRate = $cases->count() > 0 
            ? round(($completed / $cases->count()) * 100, 2)
            : null;

        $reasons = $cases
            ->whereNotNull('reason')
            ->groupBy('reason')
            ->map->count()
            ->sortDesc()
            ->map(fn($count, $reason) => ['reason' => $reason, 'total' => $count])
            ->values()
            ->toArray();

        // Handover progress (average progress of active cases)
        $activeCases = $cases->whereIn('status', ['in_progress', 'active']);
        $handoverProgress = $activeCases->count() > 0 
            ? round($activeCases->avg('progress'), 2)
            : null;

        return [
            'byStatus' => $byStatus,
            'completed' => $completed,
            'completionRate' => $completionRate,
            'reasons' => $reasons,
            'handoverProgress' => $handoverProgress,
        ];
    }

    private function calculateWorkflowMetrics($user, array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return $this->emptyWorkflowMetrics();
        }

        // Get workflows where the initiator's employee is in scope
        $initiatorUserIds = \App\Models\User::query()
            ->whereIn('employee_id', $employeeIds)
            ->pluck('id')
            ->toArray();

        $instances = WorkflowInstance::query()
            ->whereIn('initiator_user_id', $initiatorUserIds)
            ->whereBetween('submitted_at', [$from, $to])
            ->with('steps')
            ->get();

        $byStatus = $instances->groupBy('status')->map->count()->toArray();

        $total = $instances->count();
        $approved = $instances->where('status', 'approved')->count();
        $rejected = $instances->where('status', 'rejected')->count();

        $approvalRate = $total > 0 ? round(($approved / $total) * 100, 2) : null;
        $rejectionRate = $total > 0 ? round(($rejected / $total) * 100, 2) : null;

        // Average completion time (for completed workflows)
        $completed = $instances->whereNotNull('completed_at');
        $averageCompletionHours = $completed->count() > 0
            ? round($completed->avg(function ($instance) {
                return $instance->submitted_at->diffInHours($instance->completed_at);
            }), 2)
            : null;

        // Overdue steps (pending steps with due_at in the past)
        $overdueSteps = $instances
            ->where('status', 'pending')
            ->flatMap->steps
            ->where('status', 'pending')
            ->filter(fn($step) => $step->due_at && $step->due_at < now())
            ->count();

        return [
            'byStatus' => $byStatus,
            'approvalRate' => $approvalRate,
            'rejectionRate' => $rejectionRate,
            'averageCompletionHours' => $averageCompletionHours,
            'overdueSteps' => $overdueSteps > 0 ? $overdueSteps : null,
        ];
    }

    private function calculateTenureMetrics(array $employeeIds): array
    {
        if (empty($employeeIds)) {
            return ['distribution' => [], 'averageMonths' => null];
        }

        $employees = Employee::query()
            ->whereIn('id', $employeeIds)
            ->whereNull('deleted_at')
            ->whereNotNull('joined_at')
            ->get();

        $now = now();
        $tenureBuckets = [
            '0-6 months' => 0,
            '6-12 months' => 0,
            '1-2 years' => 0,
            '2-5 years' => 0,
            '5-10 years' => 0,
            '10+ years' => 0,
        ];

        $totalMonths = 0;

        foreach ($employees as $emp) {
            $months = $emp->joined_at->diffInMonths($now);
            $totalMonths += $months;

            if ($months < 6) {
                $tenureBuckets['0-6 months']++;
            } elseif ($months < 12) {
                $tenureBuckets['6-12 months']++;
            } elseif ($months < 24) {
                $tenureBuckets['1-2 years']++;
            } elseif ($months < 60) {
                $tenureBuckets['2-5 years']++;
            } elseif ($months < 120) {
                $tenureBuckets['5-10 years']++;
            } else {
                $tenureBuckets['10+ years']++;
            }
        }

        $distribution = collect($tenureBuckets)
            ->map(fn($count, $label) => ['label' => $label, 'value' => $count])
            ->values()
            ->toArray();

        $averageMonths = $employees->count() > 0 
            ? round($totalMonths / $employees->count(), 1)
            : null;

        return [
            'distribution' => $distribution,
            'averageMonths' => $averageMonths,
        ];
    }

    private function calculateGenderMetrics(array $employeeIds): array
    {
        if (empty($employeeIds)) {
            return ['distribution' => [], 'diversityIndex' => null];
        }

        $distribution = Employee::query()
            ->whereIn('employees.id', $employeeIds)
            ->whereNull('employees.deleted_at')
            ->select('gender', DB::raw('COUNT(*) as total'))
            ->groupBy('gender')
            ->get()
            ->map(fn($row) => [
                'label' => $row->gender ?? 'Not specified',
                'value' => (int) $row->total,
            ])
            ->toArray();

        // Simple diversity index: 1 - sum of squared proportions (Simpson's diversity index)
        $total = array_sum(array_column($distribution, 'value'));
        $diversityIndex = null;
        
        if ($total > 0) {
            $sumSquares = collect($distribution)
                ->sum(fn($item) => ($item['value'] / $total) ** 2);
            $diversityIndex = round(1 - $sumSquares, 3);
        }

        return [
            'distribution' => $distribution,
            'diversityIndex' => $diversityIndex,
        ];
    }

    private function calculateHiresMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return [
                'cumulative' => [],
                'annual' => [],
                'internalVsExternal' => ['internal' => 0, 'external' => 0],
            ];
        }

        $employees = Employee::query()
            ->whereIn('id', $employeeIds)
            ->withTrashed()
            ->whereNotNull('joined_at')
            ->get();

        // Cumulative hires (all-time, grouped by year)
        $cumulativeByYear = $employees
            ->groupBy(fn($emp) => $emp->joined_at->format('Y'))
            ->map->count()
            ->sortKeys()
            ->map(fn($count, $year) => ['year' => $year, 'total' => $count])
            ->values()
            ->toArray();

        // Annual hires within date range
        $annualHires = $employees
            ->filter(fn($emp) => 
                $emp->joined_at->toDateString() >= $from 
                && $emp->joined_at->toDateString() <= $to
            )
            ->groupBy(fn($emp) => $emp->joined_at->format('Y'))
            ->map->count()
            ->sortKeys()
            ->map(fn($count, $year) => ['year' => $year, 'total' => $count])
            ->values()
            ->toArray();

        // Internal vs external hires (within date range)
        $hiresInPeriod = $employees->filter(fn($emp) => 
            $emp->joined_at->toDateString() >= $from 
            && $emp->joined_at->toDateString() <= $to
        );

        $internal = 0;
        $external = 0;

        foreach ($hiresInPeriod as $emp) {
            if (empty($emp->hire_source)) {
                // If hire_source is not set, count as external by default
                $external++;
            } elseif (in_array($emp->hire_source, ['internal_promotion', 'internal_transfer', 'internal'])) {
                $internal++;
            } else {
                $external++;
            }
        }

        return [
            'cumulative' => $cumulativeByYear,
            'annual' => $annualHires,
            'internalVsExternal' => ['internal' => $internal, 'external' => $external],
        ];
    }

    private function calculateLifecycleMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return [
                'onboarding' => ['active' => 0, 'completed' => 0, 'avgDays' => null],
                'offboarding' => ['active' => 0, 'completed' => 0, 'avgDays' => null],
                'retention' => ['rate' => null, 'turnover' => null],
            ];
        }

        $onboardingCases = OnboardingCase::query()
            ->whereIn('employee_id', $employeeIds)
            ->get();

        $offboardingCases = OffboardingCase::query()
            ->whereIn('employee_id', $employeeIds)
            ->get();

        // Calculate average onboarding duration
        $completedOnboarding = $onboardingCases->where('status', 'completed');
        $avgOnboardingDays = null;
        if ($completedOnboarding->count() > 0) {
            $avgOnboardingDays = round($completedOnboarding->avg(function ($case) {
                return $case->start_date->diffInDays($case->updated_at);
            }), 1);
        }

        // Calculate average offboarding duration
        $completedOffboarding = $offboardingCases->where('status', 'completed');
        $avgOffboardingDays = null;
        if ($completedOffboarding->count() > 0) {
            $avgOffboardingDays = round($completedOffboarding->avg(function ($case) {
                return now()->diffInDays($case->exit_date);
            }), 1);
        }

        // Retention and turnover
        $totalEmployees = Employee::whereIn('id', $employeeIds)->withTrashed()->count();
        $departures = Employee::whereIn('id', $employeeIds)
            ->onlyTrashed()
            ->whereBetween('deleted_at', [$from, $to])
            ->count();

        $turnoverRate = $totalEmployees > 0 
            ? round(($departures / $totalEmployees) * 100, 2)
            : null;
        
        $retentionRate = $turnoverRate !== null 
            ? round(100 - $turnoverRate, 2)
            : null;

        return [
            'onboarding' => [
                'active' => $onboardingCases->where('status', 'active')->count(),
                'completed' => $completedOnboarding->count(),
                'avgDays' => $avgOnboardingDays,
            ],
            'offboarding' => [
                'active' => $offboardingCases->where('status', 'in_progress')->count(),
                'completed' => $completedOffboarding->count(),
                'avgDays' => $avgOffboardingDays,
            ],
            'retention' => [
                'rate' => $retentionRate,
                'turnover' => $turnoverRate,
            ],
        ];
    }

    private function calculateOperationsMetrics(array $employeeIds, string $from, string $to): array
    {
        if (empty($employeeIds)) {
            return [
                'documents' => ['pending' => 0, 'expired' => 0, 'total' => 0],
                'compliance' => ['rate' => null],
                'automation' => ['workflows' => 0, 'automationRate' => null],
            ];
        }

        // Document metrics
        $documents = \App\Models\EmployeeDocument::query()
            ->whereIn('employee_id', $employeeIds)
            ->get();

        $pendingDocs = $documents->where('status', 'pending_review')->count();
        $expiredDocs = $documents->filter(function ($doc) {
            return $doc->expiry_date && $doc->expiry_date < now();
        })->count();

        // Compliance rate: (approved docs / total docs requiring review)
        $totalDocsRequiringReview = $documents->whereIn('status', ['pending_review', 'approved', 'rejected'])->count();
        $approvedDocs = $documents->where('status', 'approved')->count();
        $complianceRate = $totalDocsRequiringReview > 0 
            ? round(($approvedDocs / $totalDocsRequiringReview) * 100, 2)
            : null;

        // Workflow automation metrics
        $totalWorkflows = WorkflowInstance::query()
            ->whereHas('initiator', function ($query) use ($employeeIds) {
                $query->whereIn('employee_id', $employeeIds);
            })
            ->whereBetween('submitted_at', [$from, $to])
            ->count();

        $automatedWorkflows = $totalWorkflows; // All workflows in system are automated
        $automationRate = $totalWorkflows > 0 ? 100 : null;

        return [
            'documents' => [
                'pending' => $pendingDocs,
                'expired' => $expiredDocs,
                'total' => $documents->count(),
            ],
            'compliance' => [
                'rate' => $complianceRate,
            ],
            'automation' => [
                'workflows' => $automatedWorkflows,
                'automationRate' => $automationRate,
            ],
        ];
    }

    private function calculateWorkingDays(string $from, string $to): int
    {
        $start = \Carbon\Carbon::parse($from);
        $end = \Carbon\Carbon::parse($to);
        $workingDays = 0;

        while ($start <= $end) {
            if (!$start->isWeekend()) {
                $workingDays++;
            }
            $start->addDay();
        }

        return $workingDays;
    }

    private function detectLimitations(int $employeeCount): array
    {
        $limitations = [];

        if ($employeeCount === 0) {
            $limitations['no_data'] = 'No employees in scope for the selected filters';
        }

        if ($employeeCount < 10) {
            $limitations['small_sample'] = 'Small sample size may affect statistical reliability';
        }

        return $limitations;
    }

    // Empty metric structures for when no data is available
    private function emptyWorkforceMetrics(): array
    {
        return [
            'headcount' => 0,
            'active' => 0,
            'onLeave' => 0,
            'newHires' => 0,
            'departures' => null,
            'departmentDistribution' => [],
            'statusDistribution' => [],
            'headcountTrend' => [],
        ];
    }

    private function emptyLeaveMetrics(): array
    {
        return [
            'byStatus' => [],
            'byType' => [],
            'monthlyTrend' => [],
            'approvedDays' => 0,
            'absenceRate' => null,
            'upcomingAbsences' => 0,
        ];
    }

    private function emptyOnboardingMetrics(): array
    {
        return [
            'byStatus' => [],
            'active' => 0,
            'completed' => 0,
            'completionRate' => null,
            'overdueTasks' => 0,
        ];
    }

    private function emptyOffboardingMetrics(): array
    {
        return [
            'byStatus' => [],
            'completed' => 0,
            'completionRate' => null,
            'reasons' => [],
            'handoverProgress' => null,
        ];
    }

    private function emptyWorkflowMetrics(): array
    {
        return [
            'byStatus' => [],
            'approvalRate' => null,
            'rejectionRate' => null,
            'averageCompletionHours' => null,
            'overdueSteps' => null,
        ];
    }
}
