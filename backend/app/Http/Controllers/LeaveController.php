<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Support\ApiPresenter;
use App\Support\WorkflowStarter;
use Carbon\Carbon;
use Illuminate\Http\Request;

class LeaveController extends Controller
{
    /**
     * GET /leave-requests — BARE paginated page {data, page, pageSize,
     * total, meta} (see README: ambiguity decision #1). The HR page
     * adapter must read this shape, not an enveloped array.
     */
    public function index(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));

        $query = LeaveRequest::with(['employee', 'leaveType', 'backupEmployee'])->orderByDesc('submitted_at');
        if (! $this->can('people.employee.view.all')) {
            if ($this->can('people.employee.view.department')) {
                $query->whereIn('employee_id', $this->subtreeIds());
            } else {
                $me = $this->myEmployee();
                $query->where('employee_id', $me?->id ?? 0);
            }
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $total = $query->count();
        $items = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::paginatedPage(
            $items->map(fn ($r) => ApiPresenter::leaveRequest($r))->values()->all(),
            $page, $pageSize, $total
        ));
    }

    public function store(Request $request)
    {
        $isHr = $this->can('people.employee.view.all');
        $data = $request->validate([
            'employee_id' => [$isHr ? 'required' : 'nullable', 'integer', 'exists:employees,id'],
            'leave_type_id' => ['required', 'string', 'exists:leave_types,id'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'from_half' => ['nullable', 'string', 'in:full,AM,PM'],
            'to_half' => ['nullable', 'string', 'in:full,AM,PM'],
            'duration' => ['nullable', 'numeric', 'min:0'],
            'backup_employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'note' => ['nullable', 'string'],
        ]);

        $employeeId = $data['employee_id'] ?? $this->myEmployee()?->id;
        if (! $employeeId) {
            return response()->json(['message' => 'No employee record linked to this user.', 'errors' => ['employee_id' => ['No employee record linked to this user.']]], 422);
        }

        // Employee self-service: server computes working days (decision #5).
        $duration = $data['duration'] ?? $this->workingDays(
            $data['start_date'], $data['end_date'],
            $data['from_half'] ?? 'full', $data['to_half'] ?? 'full'
        );

        $leave = LeaveRequest::create([
            'employee_id' => $employeeId,
            'leave_type_id' => $data['leave_type_id'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'from_half' => $data['from_half'] ?? 'full',
            'to_half' => $data['to_half'] ?? 'full',
            'duration' => $duration,
            'backup_employee_id' => $data['backup_employee_id'] ?? null,
            'note' => $data['note'] ?? null,
            'status' => 'pending',
            'submitted_at' => now(),
        ]);
        $leave->load(['employee', 'leaveType', 'backupEmployee']);

        WorkflowStarter::startFor('leave_request', (string) $leave->id, (string) $this->user()->id, $leave->employee);

        return response()->json(['data' => ApiPresenter::leaveRequest($leave)], 201);
    }

    public function destroy(LeaveRequest $leaveRequest)
    {
        if (! $this->can('people.employee.view.all')) {
            $me = $this->myEmployee();
            if (! $me || $leaveRequest->employee_id !== $me->id) {
                return $this->forbidden();
            }
        }
        $leaveRequest->delete();
        $this->logAudit('leave.deleted', 'leave_request', $leaveRequest->id, (string) $leaveRequest->employee_id);

        return response()->noContent();
    }

    public function leaveTypes()
    {
        return response()->json(['data' => LeaveType::all()
            ->map(fn ($t) => ApiPresenter::leaveType($t))->values()->all()]);
    }

    /** Working days between two dates, excluding weekends (Sat/Sun) and holidays; half-days count 0.5. */
    private function workingDays(string $start, string $end, string $fromHalf, string $toHalf): float
    {
        $holidays = Holiday::pluck('date')->map(fn ($d) => Carbon::parse($d)->toDateString())->all();
        $days = 0.0;
        $cursor = Carbon::parse($start);
        $last = Carbon::parse($end);
        while ($cursor->lte($last)) {
            if (! $cursor->isWeekend() && ! in_array($cursor->toDateString(), $holidays, true)) {
                $value = 1.0;
                if ($cursor->isSameDay(Carbon::parse($start)) && $fromHalf !== 'full') {
                    $value = 0.5;
                }
                if ($cursor->isSameDay($last) && $toHalf !== 'full') {
                    $value = $cursor->isSameDay(Carbon::parse($start)) && $fromHalf !== 'full' ? $value : 0.5;
                }
                $days += $value;
            }
            $cursor->addDay();
        }

        return $days;
    }
}
