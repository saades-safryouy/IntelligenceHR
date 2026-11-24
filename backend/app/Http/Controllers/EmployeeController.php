<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveEntitlement;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Notification;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\ReportingRelationship;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    private const SORTABLE = [
        'id', 'first_name', 'last_name', 'job_title', 'department', 'team',
        'position', 'manager', 'employment_type', 'status', 'location',
        'country', 'joined_at', 'email', 'gender', 'marital_status',
        'number_of_children', 'nationality_id', 'national_id',
        'passport_number', 'passport_validity_date', 'personal_phone',
        'professional_phone', 'personal_info_completed_at',
        'onboarding_status', 'offboarding_status', 'document_status',
        'emergency_contact_name', 'emergency_contact_phone',
        'emergency_contact_relationship', 'created_at', 'updated_at',
    ];

    public function index(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));

        $query = $this->scopeEmployees(Employee::query()->with(['department', 'manager', 'documents']));

        if ($q = $request->query('q')) {
            $query->where(function ($w) use ($q) {
                $w->where('first_name', 'like', "%{$q}%")
                    ->orWhere('last_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('job_title', 'like', "%{$q}%");
            });
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if (is_array($request->query('filters'))) {
            foreach ($request->query('filters') as $field => $value) {
                if (! in_array($field, self::SORTABLE, true)) {
                    continue;
                }
                if (is_array($value)) {
                    if (isset($value['from'])) {
                        $query->where($field, '>=', $value['from']);
                    }
                    if (isset($value['to'])) {
                        $query->where($field, '<=', $value['to']);
                    }
                    if (isset($value['value'])) {
                        $query->where($field, $value['operator'] ?? '=', $value['value']);
                    }
                } else {
                    $query->where($field, $value);
                }
            }
        }

        $sort = $request->query('sort', 'id');
        $order = strtolower($request->query('order', 'asc')) === 'desc' ? 'desc' : 'asc';
        $sortColumn = match ($sort) {
            'department' => 'department_id',
            'manager' => 'manager_id',
            'position' => 'position_title',
            'joined' => 'joined_at',
            default => in_array($sort, self::SORTABLE, true) ? $sort : 'id',
        };
        $query->orderBy($sortColumn, $order);

        $total = $query->count();
        $employees = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::page(
            $employees->map(fn ($e) => ApiPresenter::employee($e))->values()->all(),
            $page, $pageSize, $total
        ));
    }

    public function show(Employee $employee)
    {
        if (! $this->can('people.employee.view.all')) {
            $visible = $this->scopeEmployees(Employee::query())->pluck('id')->all();
            if (! in_array($employee->id, $visible, true)) {
                return $this->forbidden();
            }
        }
        $employee->load(['department', 'manager', 'documents']);

        return response()->json(['data' => ApiPresenter::employee($employee)]);
    }

    public function store(Request $request)
    {
        if (! $this->can('people.employee.create')) {
            return $this->forbidden();
        }
        $data = $this->validateEmployee($request);
        $employee = Employee::create($data);
        $this->logAudit('employee.created', 'employee', $employee->id, $employee->first_name.' '.$employee->last_name);
        $employee->load(['department', 'manager']);

        return response()->json(['data' => ApiPresenter::employee($employee)], 201);
    }

    public function update(Request $request, Employee $employee)
    {
        $isSelf = $this->myEmployee()?->id === $employee->id;
        if (! $this->can('people.employee.update') && ! ($isSelf && $this->can('people.employee.self.update'))) {
            return $this->forbidden();
        }
        $data = $this->validateEmployee($request, partial: true);
        $employee->update($data);
        $this->logAudit('employee.updated', 'employee', $employee->id, $employee->first_name.' '.$employee->last_name);
        $employee->load(['department', 'manager', 'documents']);

        return response()->json(['data' => ApiPresenter::employee($employee)]);
    }

    public function destroy(Employee $employee)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $employee->delete();
        $this->logAudit('employee.deleted', 'employee', $employee->id, $employee->first_name.' '.$employee->last_name);

        return response()->noContent();
    }

    /** GET /employees/summary — one-shot payload for the employee dashboard. */
    public function summary(Request $request)
    {
        $employee = $this->myEmployee();
        if ($request->query('employeeId') && $this->can('people.employee.view.all')) {
            $employee = Employee::find($request->query('employeeId')) ?? $employee;
        }
        if (! $employee) {
            return response()->json(['message' => 'No employee record linked to this user.'], 404);
        }
        $employee->load(['department', 'manager', 'documents']);

        $leaveRequests = LeaveRequest::with(['employee', 'leaveType', 'backupEmployee'])
            ->where('employee_id', $employee->id)->orderByDesc('submitted_at')->get();
        $types = LeaveType::all();
        $entitlements = LeaveEntitlement::where('employee_id', $employee->id)->get();
        $onboarding = OnboardingCase::with('tasks')->where('employee_id', $employee->id)->get();
        $offboarding = OffboardingCase::where('employee_id', $employee->id)->get();
        $documents = $employee->documents()->get();
        $holidays = Holiday::orderBy('date')->get();
        $notifications = Notification::where('user_id', $this->user()->id)->orderByDesc('created_at')->take(100)->get();

        return response()->json([
            'employee' => ApiPresenter::employee($employee),
            'leaveRequests' => $leaveRequests->map(fn ($r) => ApiPresenter::leaveRequest($r))->values()->all(),
            'leaveTypes' => $types->map(fn ($t) => ApiPresenter::leaveType($t, withCode: true))->values()->all(),
            'leaveEntitlements' => $entitlements->map(fn ($e) => [
                'employee_id' => $e->employee_id, 'leave_type_id' => $e->leave_type_id, 'entitlement' => $e->entitlement,
            ])->values()->all(),
            'onboardingCases' => $onboarding->map(fn ($c) => ApiPresenter::onboardingCase($c))->values()->all(),
            'offboardingCases' => $offboarding->map(fn ($c) => ApiPresenter::offboardingCase($c))->values()->all(),
            'documents' => $documents->map(function ($d) {
                $out = ApiPresenter::document($d);
                unset($out['employee']);
                return $out;
            })->values()->all(),
            'holidays' => $holidays->map(fn ($h) => ApiPresenter::holiday($h))->values()->all(),
            'notifications' => $notifications->map(fn ($n) => ApiPresenter::notification($n))->values()->all(),
            'unreadCount' => Notification::where('user_id', $this->user()->id)->unread()->count(),
        ]);
    }

    /** PUT /employees/{employee}/reporting-relationships */
    public function reportingRelationships(Request $request, Employee $employee)
    {
        if (! $this->can('people.reporting.update')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'managerEmployeeId' => ['nullable', 'integer', 'exists:employees,id'],
            'effectiveFrom' => ['required', 'date'],
        ]);
        $managerId = $data['managerEmployeeId'] ?? null;

        if ($managerId === $employee->id) {
            return response()->json(['message' => 'An employee cannot report to themselves.', 'errors' => ['managerEmployeeId' => ['An employee cannot report to themselves.']]], 422);
        }
        // Cycle check: walk up from the proposed manager.
        $cursor = $managerId;
        $seen = [];
        while ($cursor) {
            if ($cursor === $employee->id || in_array($cursor, $seen, true)) {
                return response()->json(['message' => 'This reporting change would create a cycle.', 'errors' => ['managerEmployeeId' => ['This reporting change would create a cycle.']]], 422);
            }
            $seen[] = $cursor;
            $cursor = Employee::find($cursor)?->manager_id;
        }

        $from = $data['effectiveFrom'];
        ReportingRelationship::where('employee_id', $employee->id)
            ->where('is_primary', true)
            ->whereNull('effective_to')
            ->update(['effective_to' => date('Y-m-d', strtotime($from.' -1 day'))]);

        $relationship = ReportingRelationship::create([
            'employee_id' => $employee->id,
            'manager_employee_id' => $managerId,
            'effective_from' => $from,
            'is_primary' => true,
        ]);
        $employee->update(['manager_id' => $managerId]);

        return response()->json(['data' => [
            'id' => $relationship->id,
            'employeeId' => $employee->id,
            'managerEmployeeId' => $managerId,
            'effectiveFrom' => $from,
        ]]);
    }

    private function validateEmployee(Request $request, bool $partial = false): array
    {
        $sometimes = $partial ? 'sometimes' : '';
        $rules = [
            'first_name' => [$sometimes, 'required', 'string', 'max:255'],
            'last_name' => [$sometimes, 'required', 'string', 'max:255'],
            'job_title' => [$sometimes, 'nullable', 'string', 'max:255'],
            'department_id' => [$sometimes, 'nullable', 'string', 'exists:departments,id'],
            'team_id' => [$sometimes, 'nullable', 'string'],
            'position_id' => [$sometimes, 'nullable', 'string'],
            'position_title' => [$sometimes, 'nullable', 'string', 'max:255'],
            'employment_type' => [$sometimes, 'nullable', 'string', Rule::in(['Full-time', 'Part-time', 'Contractor'])],
            'status' => [$sometimes, 'nullable', 'string', Rule::in(['Active', 'On Leave', 'Suspended', 'Terminated'])],
            'location' => [$sometimes, 'nullable', 'string', 'max:255'],
            'country' => [$sometimes, 'nullable', 'string', 'size:2'],
            'joined_at' => [$sometimes, 'nullable', 'date'],
            'email' => [$sometimes, 'nullable', 'email', 'max:255'],
            'gender' => [$sometimes, 'nullable', 'string', Rule::in(['Male', 'Female'])],
            'marital_status' => [$sometimes, 'nullable', 'string', Rule::in(['Single', 'Married', 'Divorced', 'Widowed'])],
            'number_of_children' => [$sometimes, 'nullable', 'integer', 'min:0'],
            'national_id' => [$sometimes, 'nullable', 'string', 'max:255'],
            'nationality_id' => [$sometimes, 'nullable', 'integer'],
            'passport_number' => [$sometimes, 'nullable', 'string', 'max:255'],
            'passport_validity_date' => [$sometimes, 'nullable', 'date'],
            'personal_phone' => [$sometimes, 'nullable', 'string', 'max:50'],
            'professional_phone' => [$sometimes, 'nullable', 'string', 'max:50'],
            'personal_info_completed_at' => [$sometimes, 'nullable', 'date'],
            'personal_info_dismissed_until' => [$sometimes, 'nullable', 'date'],
            'emergency_contact_name' => [$sometimes, 'nullable', 'string', 'max:255'],
            'emergency_contact_phone' => [$sometimes, 'nullable', 'string', 'max:50'],
            'emergency_contact_relationship' => [$sometimes, 'nullable', 'string', 'max:255'],
        ];

        $rules = array_map(fn ($r) => array_values(array_filter($r, fn ($v) => $v !== '')), $rules);

        return Validator::make($request->all(), $rules)->validate();
    }
}
