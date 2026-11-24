<?php

namespace App\Http\Controllers;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Support\ApiPresenter;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AttendanceController extends Controller
{
    private const STATUSES = ['present', 'absent', 'late'];
    private const TIME_RE = '/^([01]\d|2[0-3]):[0-5]\d$/';

    /** Lateness threshold (decision, flagged for Saad): check-in after 09:30 counts as late. */
    private const LATE_AFTER = '09:30';

    /** Employee ids the current user may see records for (HR all, managers dept/subtree, others self). */
    private function allowedEmployeeIds(): array
    {
        return $this->scopeEmployees(Employee::query())->pluck('id')->all();
    }

    private function canManageEmployee(int $employeeId): bool
    {
        if ($this->can('people.employee.view.all')) {
            return true;
        }
        if ($this->can('people.employee.view.department')) {
            return in_array($employeeId, $this->allowedEmployeeIds(), true);
        }
        $me = $this->myEmployee();

        return $me !== null && (int) $me->id === $employeeId;
    }

    private function hoursBetween(?string $in, ?string $out): ?float
    {
        if (! $in || ! $out) {
            return null;
        }
        $start = Carbon::createFromFormat('H:i', $in);
        $end = Carbon::createFromFormat('H:i', $out);
        if ($end->lte($start)) {
            return null;
        }

        return round($start->diffInMinutes($end) / 60, 2);
    }

    /**
     * GET /attendance-records?from=&to=&employee_id=
     * Defaults to the current month. Approved leave requests are merged in
     * as read-only rows with status "leave" (leave data is NOT duplicated).
     */
    public function index(Request $request)
    {
        $from = $request->filled('from') ? Carbon::parse($request->input('from'))->toDateString()
            : now()->startOfMonth()->toDateString();
        $to = $request->filled('to') ? Carbon::parse($request->input('to'))->toDateString()
            : now()->endOfMonth()->toDateString();
        $allowed = $this->allowedEmployeeIds();
        $query = AttendanceRecord::with('employee')->whereIn('employee_id', $allowed)
            ->whereBetween('date', [$from, $to]);
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->integer('employee_id'));
        }
        $records = $query->orderBy('date')->orderBy('employee_id')->get();
        $rows = $records->map(fn ($r) => ApiPresenter::attendanceRecord($r))->values()->all();

        // Merge approved leave as read-only "leave" rows for days without a record.
        $have = [];
        foreach ($records as $r) {
            $have[$r->employee_id.'|'.$r->date->toDateString()] = true;
        }
        $leaves = LeaveRequest::with(['employee', 'leaveType'])
            ->whereIn('employee_id', $allowed)
            ->where('status', 'approved')
            ->where('start_date', '<=', $to)
            ->where('end_date', '>=', $from)
            ->get();
        foreach ($leaves as $leave) {
            $day = Carbon::parse($leave->start_date);
            $end = Carbon::parse($leave->end_date);
            while ($day->lte($end)) {
                $key = $leave->employee_id.'|'.$day->toDateString();
                if (! isset($have[$key]) && $day->toDateString() >= $from && $day->toDateString() <= $to) {
                    $rows[] = ApiPresenter::attendanceLeaveRow($leave, $day->toDateString());
                }
                $day->addDay();
            }
        }
        usort($rows, fn ($a, $b) => [$a['date'], $a['employee_id']] <=> [$b['date'], $b['employee_id']]);

        return response()->json(['data' => $rows]);
    }

    /**
     * POST /attendance-records — manual check-in/out or timesheet entry.
     * Upserts by (employee_id, date): a second call for the same day updates
     * the existing record instead of creating a duplicate.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'date' => ['required', 'date'],
            'check_in' => ['nullable', 'string', 'regex:'.self::TIME_RE],
            'check_out' => ['nullable', 'string', 'regex:'.self::TIME_RE],
            'status' => ['nullable', 'string', Rule::in(self::STATUSES)],
            'notes' => ['nullable', 'string'],
        ]);
        if (! $this->canManageEmployee((int) $data['employee_id'])) {
            return $this->forbidden();
        }
        if (! empty($data['check_in']) && ! empty($data['check_out']) && $data['check_out'] <= $data['check_in']) {
            return response()->json(['message' => 'Check-out must be after check-in.'], 422);
        }
        $status = $data['status'] ?? (
            ! empty($data['check_in'])
                ? ($data['check_in'] > self::LATE_AFTER ? 'late' : 'present')
                : 'absent'
        );
        $record = AttendanceRecord::updateOrCreate(
            ['employee_id' => $data['employee_id'], 'date' => $data['date']],
            [
                'check_in' => $data['check_in'] ?? null,
                'check_out' => $data['check_out'] ?? null,
                'status' => $status,
                'hours_worked' => $this->hoursBetween($data['check_in'] ?? null, $data['check_out'] ?? null),
                'notes' => $data['notes'] ?? null,
            ]
        );
        $record->load('employee');
        $this->logAudit('attendance_record.saved', 'attendance_record', $record->id, $record->employee?->fullName().' '.$record->date->toDateString());

        return response()->json(['data' => ApiPresenter::attendanceRecord($record)], 201);
    }

    public function update(Request $request, AttendanceRecord $attendanceRecord)
    {
        $me = $this->myEmployee();
        $isOwner = $me !== null && (int) $attendanceRecord->employee_id === (int) $me->id;
        $isManager = $this->can('people.employee.view.department') && $this->canManageEmployee((int) $attendanceRecord->employee_id);
        $isHr = $this->can('people.employee.view.all');
        if (! $isHr && ! $isManager && ! $isOwner) {
            return $this->forbidden();
        }
        // Employees can only edit their own record while it is not validated.
        if ($isOwner && ! $isHr && ! $isManager && $attendanceRecord->validated) {
            return response()->json(['message' => 'This record has been validated and can no longer be edited.'], 422);
        }
        $data = $request->validate([
            'check_in' => ['nullable', 'string', 'regex:'.self::TIME_RE],
            'check_out' => ['nullable', 'string', 'regex:'.self::TIME_RE],
            'status' => ['nullable', 'string', Rule::in(self::STATUSES)],
            'notes' => ['nullable', 'string'],
            'validated' => ['nullable', 'boolean'],
        ]);
        // Only HR/managers may validate.
        if (array_key_exists('validated', $data) && ! $isHr && ! $isManager) {
            return $this->forbidden();
        }
        $checkIn = $data['check_in'] ?? $attendanceRecord->check_in;
        $checkOut = $data['check_out'] ?? $attendanceRecord->check_out;
        if ($checkIn && $checkOut && $checkOut <= $checkIn) {
            return response()->json(['message' => 'Check-out must be after check-in.'], 422);
        }
        $updates = [
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'hours_worked' => $this->hoursBetween($checkIn, $checkOut),
        ];
        if (isset($data['status'])) {
            $updates['status'] = $data['status'];
        } elseif ($checkIn && $attendanceRecord->status !== 'absent') {
            $updates['status'] = $checkIn > self::LATE_AFTER ? 'late' : 'present';
        }
        if (array_key_exists('notes', $data)) {
            $updates['notes'] = $data['notes'];
        }
        if (array_key_exists('validated', $data)) {
            $updates['validated'] = (bool) $data['validated'];
            $updates['validated_by'] = (bool) $data['validated'] ? $this->user()->id : null;
        }
        $attendanceRecord->update($updates);
        $attendanceRecord->load('employee');
        $this->logAudit('attendance_record.updated', 'attendance_record', $attendanceRecord->id, $attendanceRecord->employee?->fullName().' '.$attendanceRecord->date->toDateString());

        return response()->json(['data' => ApiPresenter::attendanceRecord($attendanceRecord)]);
    }

    public function destroy(AttendanceRecord $attendanceRecord)
    {
        if (! $this->can('people.employee.view.all')) {
            return $this->forbidden();
        }
        $attendanceRecord->delete();
        $this->logAudit('attendance_record.deleted', 'attendance_record', $attendanceRecord->id, $attendanceRecord->employee?->fullName());

        return response()->noContent();
    }
}
