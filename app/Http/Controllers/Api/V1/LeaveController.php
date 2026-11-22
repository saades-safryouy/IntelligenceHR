<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveEntitlement;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Services\AuditLogger;
use App\Services\EmployeeVisibility;
use App\Services\WorkflowEngine;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LeaveController extends Controller
{
    public function types(): JsonResponse
    {
        return response()->json(['data' => LeaveType::where('is_active', true)->get()]);
    }

    public function entitlements(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'employeeId' => ['nullable', 'integer', 'exists:employees,id'],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2200'],
        ]);
        $query = LeaveEntitlement::with('leaveType')
            ->whereIn('employee_id', $visibility->query($request->user())->select('id'))
            ->when($filters['employeeId'] ?? null, fn ($builder, $id) => $builder->where('employee_id', $id))
            ->when($filters['year'] ?? null, fn ($builder, $year) => $builder->where('year', $year));

        return response()->json(['data' => $query->get()]);
    }

    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'employeeId' => ['nullable', 'integer', 'exists:employees,id'],
            'status' => ['nullable', 'in:pending,approved,rejected,cancelled'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = LeaveRequest::with(['employee', 'leaveType', 'backupEmployee'])
            ->whereIn('employee_id', $visibility->query($request->user())->select('id'))
            ->when($filters['employeeId'] ?? null, fn ($builder, $id) => $builder->where('employee_id', $id))
            ->when($filters['status'] ?? null, fn ($builder, $status) => $builder->where('status', $status))
            ->orderByDesc('submitted_at');

        $paginator = $query->paginate($filters['pageSize'] ?? 25)->appends($request->query());

        return response()->json([
            'data' => collect($paginator->items())->map(fn (LeaveRequest $item) => $this->serialize($item)),
            'page' => $paginator->currentPage(),
            'pageSize' => $paginator->perPage(),
            'total' => $paginator->total(),
        ]);
    }

    public function store(
        Request $request,
        AuditLogger $audit,
        WorkflowEngine $workflow,
    ): JsonResponse {
        $data = $request->validate([
            'employee_id' => ['sometimes', 'nullable', 'integer', 'exists:employees,id'],
            'leave_type_id' => ['required', 'exists:leave_types,id'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'from_half' => ['sometimes', 'string', 'in:full,AM,PM'],
            'to_half' => ['sometimes', 'string', 'in:full,AM,PM'],
            'duration' => ['sometimes', 'numeric', 'min:0.5'],
            'backup_employee_id' => ['nullable', 'exists:employees,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();
        if ($user->hasPermission('people.employee.update')) {
            if (! isset($data['employee_id'])) {
                throw ValidationException::withMessages(['employee_id' => ['An employee is required.']]);
            }
        } else {
            abort_unless($user->hasPermission('people.employee.self.update') && $user->employee_id, 403);
            if (isset($data['employee_id']) && (int) $data['employee_id'] !== (int) $user->employee_id) {
                abort(403);
            }
            abort_if(! empty($data['backup_employee_id']), 403);
            $data['employee_id'] = $user->employee_id;
        }

        $employee = Employee::query()->findOrFail($data['employee_id']);
        $leaveType = LeaveType::query()->whereKey($data['leave_type_id'])->where('is_active', true)->first();
        if (! $leaveType) {
            throw ValidationException::withMessages(['leave_type_id' => ['The selected leave type is inactive.']]);
        }

        $fromHalf = $data['from_half'] ?? 'full';
        $toHalf = $data['to_half'] ?? 'full';
        $duration = $this->workingDays(
            CarbonImmutable::parse($data['start_date']),
            CarbonImmutable::parse($data['end_date']),
            $fromHalf,
            $toHalf,
            $employee,
        );
        if ($duration <= 0) {
            throw ValidationException::withMessages(['start_date' => ['The selected dates contain no working leave days.']]);
        }

        $overlap = LeaveRequest::query()
            ->where('employee_id', $employee->id)
            ->whereIn('status', ['pending', 'approved'])
            ->whereDate('start_date', '<=', $data['end_date'])
            ->whereDate('end_date', '>=', $data['start_date'])
            ->exists();
        if ($overlap) {
            throw ValidationException::withMessages(['start_date' => ['The selected dates overlap an existing leave request.']]);
        }

        $entitlement = LeaveEntitlement::query()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('year', CarbonImmutable::parse($data['start_date'])->year)
            ->value('entitlement');
        if ($entitlement !== null) {
            $used = LeaveRequest::query()
                ->where('employee_id', $employee->id)
                ->where('leave_type_id', $leaveType->id)
                ->where('status', 'approved')
                ->whereYear('start_date', CarbonImmutable::parse($data['start_date'])->year)
                ->sum('duration');
            $pending = LeaveRequest::query()
                ->where('employee_id', $employee->id)
                ->where('leave_type_id', $leaveType->id)
                ->where('status', 'pending')
                ->whereYear('start_date', CarbonImmutable::parse($data['start_date'])->year)
                ->sum('duration');
            if ($duration + (float) $used + (float) $pending > (float) $entitlement) {
                throw ValidationException::withMessages(['duration' => ['The request exceeds the available leave balance.']]);
            }
        }

        $data['duration'] = $duration;
        $data['from_half'] = $fromHalf;
        $data['to_half'] = $toHalf;
        $leaveRequest = DB::transaction(function () use ($data, $audit, $request, $workflow) {
            $lr = LeaveRequest::create([
                ...$data,
                'status' => 'pending',
                'submitted_at' => now(),
            ]);
            $audit->record($request->user(), 'leave.requested', $lr);
            $workflow->startForResource($request->user(), 'leave', 'leave_request', (string) $lr->id, $audit);

            return $lr;
        });

        return response()->json(['data' => $this->serialize($leaveRequest->load(['employee', 'leaveType', 'backupEmployee']))], 201);
    }

    public function updateStatus(Request $request, LeaveRequest $leaveRequest, AuditLogger $audit): JsonResponse
    {
        return response()->json([
            'message' => 'Leave status changes must be made through a workflow decision.',
        ], 409);
    }

    public function show(Request $request, LeaveRequest $leaveRequest, EmployeeVisibility $visibility): JsonResponse
    {
        abort_unless($visibility->canSee($request->user(), $leaveRequest->employee), 404);

        return response()->json(['data' => $this->serialize($leaveRequest->load(['employee', 'leaveType', 'backupEmployee']))]);
    }

    public function destroy(
        Request $request,
        LeaveRequest $leaveRequest,
        EmployeeVisibility $visibility,
        AuditLogger $audit,
    ): JsonResponse {
        abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        abort_unless($visibility->canSee($request->user(), $leaveRequest->employee), 404);

        DB::transaction(function () use ($leaveRequest, $audit, $request) {
            $audit->record($request->user(), 'leave.cancelled', $leaveRequest);
            $leaveRequest->delete();
        });

        return response()->json(null, 204);
    }

    private function workingDays(
        CarbonImmutable $start,
        CarbonImmutable $end,
        string $fromHalf,
        string $toHalf,
        Employee $employee,
    ): float {
        $holidays = Holiday::query()->get(['date', 'days', 'recurring', 'country', 'site']);
        $workingDays = 0.0;
        $cursor = $start->startOfDay();
        $lastDay = $end->startOfDay();

        while ($cursor->lessThanOrEqualTo($lastDay)) {
            $holiday = $holidays->first(function (Holiday $item) use ($cursor, $employee) {
                if ($item->country && $item->country !== $employee->country) {
                    return false;
                }
                if ($item->site && $item->site !== $employee->location) {
                    return false;
                }
                $holidayDate = $item->date;
                if ($item->recurring) {
                    return collect([$cursor->year, $cursor->year - 1])->contains(function (int $year) use ($holidayDate, $item, $cursor) {
                        $occurrence = $holidayDate->setYear($year)->startOfDay();

                        return $cursor->betweenIncluded(
                            $occurrence,
                            $occurrence->addDays($item->days - 1),
                        );
                    });
                }

                return $cursor->betweenIncluded($holidayDate->startOfDay(), $holidayDate->addDays($item->days - 1)->startOfDay());
            });

            if ($cursor->isWeekday() && ! $holiday) {
                $fraction = 1.0;
                if ($start->isSameDay($end)) {
                    $fraction = ($fromHalf === 'full' && $toHalf === 'full') ? 1.0 : 0.5;
                } else {
                    if ($cursor->isSameDay($start) && $fromHalf === 'PM') {
                        $fraction -= 0.5;
                    }
                    if ($cursor->isSameDay($end) && $toHalf === 'AM') {
                        $fraction -= 0.5;
                    }
                }
                $workingDays += $fraction;
            }
            $cursor = $cursor->addDay();
        }

        return $workingDays;
    }

    private function serialize(LeaveRequest $request): array
    {
        return [
            'id' => $request->id,
            'employee_id' => $request->employee_id,
            'employee' => $request->employee ? [
                'first_name' => $request->employee->first_name,
                'last_name' => $request->employee->last_name,
            ] : null,
            'leave_type_id' => $request->leave_type_id,
            'leave_type' => $request->leaveType ? [
                'id' => $request->leaveType->id,
                'code' => $request->leaveType->code,
                'name_key' => $request->leaveType->name_key,
                'color' => $request->leaveType->color,
                'paid' => $request->leaveType->paid,
            ] : null,
            'start_date' => $request->start_date?->toDateString(),
            'end_date' => $request->end_date?->toDateString(),
            'from_half' => $request->from_half,
            'to_half' => $request->to_half,
            'duration' => $request->duration,
            'backup_employee_id' => $request->backup_employee_id,
            'backup_employee' => $request->backupEmployee ? [
                'first_name' => $request->backupEmployee->first_name,
                'last_name' => $request->backupEmployee->last_name,
            ] : null,
            'note' => $request->note,
            'status' => $request->status,
            'submitted_at' => $request->submitted_at,
        ];
    }
}
