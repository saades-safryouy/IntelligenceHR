<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeResource;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\EmployeeNotification;
use App\Models\EmployeeReportingRelationship;
use App\Models\Holiday;
use App\Models\LeaveEntitlement;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\Position;
use App\Models\Team;
use App\Services\AuditLogger;
use App\Services\EmployeeVisibility;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PeopleController extends Controller
{
    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'departmentId' => ['nullable', 'uuid', 'exists:departments,id'],
            'teamId' => ['nullable', 'uuid', 'exists:teams,id'],
            'positionId' => ['nullable', 'uuid', 'exists:positions,id'],
            'managerId' => ['nullable', 'integer', 'exists:employees,id'],
            'status' => ['nullable', Rule::in(['Active', 'On Leave', 'Suspended', 'Terminated'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
            'filters' => ['sometimes', 'array'],
            'sort' => ['nullable', Rule::in([
                'id', 'first_name', 'last_name', 'job_title', 'department', 'team', 'position', 'manager',
                'employment_type', 'status', 'location', 'country', 'joined_at', 'email', 'gender',
                'marital_status', 'number_of_children', 'nationality_id', 'national_id',
                'passport_number', 'passport_validity_date', 'personal_phone', 'professional_phone',
                'personal_info_completed_at', 'onboarding_status', 'offboarding_status', 'document_status',
                'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
                'created_at', 'updated_at',
            ])],
            'order' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $sensitiveSortPermissions = [
            'gender' => 'people.employee.sensitive.view',
            'marital_status' => 'people.employee.family.view',
            'number_of_children' => 'people.employee.family.view',
            'national_id' => 'people.employee.sensitive.view',
            'passport_number' => 'people.employee.sensitive.view',
            'passport_validity_date' => 'people.employee.sensitive.view',
            'personal_phone' => 'people.employee.contact.view',
            'professional_phone' => 'people.employee.contact.view',
            'emergency_contact_name' => 'people.employee.sensitive.view',
            'emergency_contact_phone' => 'people.employee.sensitive.view',
            'emergency_contact_relationship' => 'people.employee.sensitive.view',
        ];
        if ($permission = $sensitiveSortPermissions[$filters['sort'] ?? ''] ?? null) {
            abort_unless($request->user()->hasPermission($permission), 403, 'You are not authorized to sort by this field.');
        }

        $query = $visibility->query($request->user())
            ->with([
                'department', 'team', 'position', 'user',
                'latestOnboardingCase', 'latestOffboardingCase',
                'reportingRelationships' => fn ($q) => $q
                    ->where('is_primary', true)
                    ->whereDate('effective_from', '<=', now()->toDateString())
                    ->where(fn (Builder $active) => $active
                        ->whereNull('effective_to')
                        ->orWhereDate('effective_to', '>=', now()->toDateString()))
                    ->with('manager:id,first_name,last_name'),
            ])
            ->withCount([
                'employeeDocuments as documents_total_count',
                'employeeDocuments as documents_missing_count' => fn (Builder $q) => $q->where('status', 'missing'),
                'employeeDocuments as documents_pending_count' => fn (Builder $q) => $q->whereIn('status', ['pending', 'under_review']),
                'employeeDocuments as documents_approved_count' => fn (Builder $q) => $q
                    ->where('status', 'approved')
                    ->where(fn (Builder $active) => $active->whereNull('expiry_date')->orWhereDate('expiry_date', '>=', today())),
                'employeeDocuments as documents_rejected_count' => fn (Builder $q) => $q->where('status', 'rejected'),
                'employeeDocuments as documents_archived_count' => fn (Builder $q) => $q->where('status', 'archived'),
                'employeeDocuments as documents_expired_count' => fn (Builder $q) => $q->where(function (Builder $expired): void {
                    $expired->where('status', 'expired')
                        ->orWhere(fn (Builder $approved) => $approved->where('status', 'approved')->whereDate('expiry_date', '<', today()));
                }),
            ])
            ->when($filters['departmentId'] ?? null, fn (Builder $q, $id) => $q->where('department_id', $id))
            ->when($filters['teamId'] ?? null, fn (Builder $q, $id) => $q->where('team_id', $id))
            ->when($filters['positionId'] ?? null, fn (Builder $q, $id) => $q->where('position_id', $id))
            ->when($filters['status'] ?? null, fn (Builder $q, $status) => $q->where('status', $status));

        if (isset($filters['managerId'])) {
            $query->whereIn('id', EmployeeReportingRelationship::query()
                ->select('employee_id')
                ->where('manager_employee_id', $filters['managerId'])
                ->where('is_primary', true)
                ->whereDate('effective_from', '<=', now()->toDateString())
                ->where(fn (Builder $q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', now()->toDateString())));
        }

        if ($search = trim($filters['q'] ?? '')) {
            $query->where(function (Builder $q) use ($search, $request) {
                $term = mb_strtolower($search);
                $castType = DB::connection()->getDriverName() === 'pgsql' ? 'TEXT' : 'CHAR';
                $q->whereRaw('LOWER(first_name) LIKE ?', ["%{$term}%"])
                    ->orWhereRaw('LOWER(last_name) LIKE ?', ["%{$term}%"])
                    ->orWhereRaw('LOWER(job_title) LIKE ?', ["%{$term}%"])
                    ->orWhereRaw('LOWER(email) LIKE ?', ["%{$term}%"])
                    ->orWhereHas('user', fn (Builder $uq) => $uq->whereRaw('LOWER(email) LIKE ?', ["%{$term}%"]))
                    ->orWhereRaw("CAST(id AS {$castType}) LIKE ?", ["%{$term}%"]);

                if ($request->user()->hasPermission('people.employee.sensitive.view')) {
                    $q->orWhereRaw('LOWER(national_id) LIKE ?', ["%{$term}%"]);
                }
            });
        }

        $this->applyColumnFilters($query, $filters['filters'] ?? [], $request);

        $sort = $filters['sort'] ?? 'last_name';
        $order = $filters['order'] ?? 'asc';
        $this->applySort($query, $sort, $order);
        $paginator = $query->orderBy('employees.id')
            ->paginate($filters['pageSize'] ?? 25)
            ->appends($request->query());

        return response()->json([
            'data' => EmployeeResource::collection($paginator->items())->resolve(),
            'page' => $paginator->currentPage(),
            'pageSize' => $paginator->perPage(),
            'total' => $paginator->total(),
        ]);
    }

    /**
     * Filters are intentionally allowlisted here instead of accepting arbitrary SQL column names.
     */
    private function applyColumnFilters(Builder $query, array $filters, Request $request): void
    {
        $textFields = [
            'first_name' => 'employees.first_name',
            'last_name' => 'employees.last_name',
            'email' => 'employees.email',
            'location' => 'employees.location',
            'country' => 'employees.country',
            'gender' => 'employees.gender',
            'marital_status' => 'employees.marital_status',
            'personal_phone' => 'employees.personal_phone',
            'professional_phone' => 'employees.professional_phone',
            'national_id' => 'employees.national_id',
            'passport_number' => 'employees.passport_number',
        ];
        $sensitivePermissions = [
            'gender' => 'people.employee.sensitive.view',
            'marital_status' => 'people.employee.family.view',
            'personal_phone' => 'people.employee.contact.view',
            'professional_phone' => 'people.employee.contact.view',
            'national_id' => 'people.employee.sensitive.view',
            'passport_number' => 'people.employee.sensitive.view',
            'passport_validity_date' => 'people.employee.sensitive.view',
            'emergency_contact_name' => 'people.employee.sensitive.view',
            'emergency_contact_phone' => 'people.employee.sensitive.view',
            'emergency_contact_relationship' => 'people.employee.sensitive.view',
            'number_of_children' => 'people.employee.family.view',
        ];
        $enumFilters = [
            'employment_type' => ['Full-time', 'Part-time', 'Contractor'],
            'status' => ['Active', 'On Leave', 'Suspended', 'Terminated'],
            'gender' => ['Male', 'Female'],
            'marital_status' => ['Single', 'Married', 'Divorced', 'Widowed'],
            'document_status' => ['missing', 'pending', 'under_review', 'approved', 'rejected', 'expired', 'archived'],
        ];
        $knownFields = [
            ...array_keys($textFields),
            'full_name', 'job_title', 'id', 'department', 'team', 'position', 'manager', 'employment_type', 'status',
            'joined_at', 'number_of_children', 'nationality_id', 'passport_validity_date',
            'personal_info_completed_at', 'onboarding_status', 'offboarding_status', 'document_status',
            'created_at', 'updated_at', 'emergency_contact_name', 'emergency_contact_phone',
            'emergency_contact_relationship',
        ];
        foreach ($filters as $field => $value) {
            abort_unless(in_array($field, $knownFields, true), 422, "Unsupported employee filter: {$field}.");
            abort_unless(is_string($value) || is_array($value), 422, 'Invalid employee filter value.');
            if (is_string($value)) {
                abort_if(mb_strlen($value) > 100, 422, 'Employee filters cannot exceed 100 characters.');
            }
            if ($permission = $sensitivePermissions[$field] ?? null) {
                abort_unless($request->user()->hasPermission($permission), 403, 'You are not authorized to filter this field.');
            }
            if ($value === null || $value === '' || $value === []) {
                continue;
            }
            if (isset($enumFilters[$field])) {
                abort_unless(is_string($value) && in_array($value, $enumFilters[$field], true), 422, 'Invalid employee filter value.');
            }

            if (isset($textFields[$field])) {
                abort_unless(is_string($value), 422, 'Text filters must be strings.');
                $term = mb_strtolower(trim($value));
                if ($term !== '') {
                    $query->whereRaw('LOWER('.$textFields[$field].') LIKE ?', ['%'.$term.'%']);
                }

                continue;
            }

            if ($field === 'full_name') {
                abort_unless(is_string($value), 422, 'Name filters must be strings.');
                $term = mb_strtolower(trim($value));
                if ($term !== '') {
                    $query->where(fn (Builder $name) => $name
                        ->whereRaw('LOWER('.$this->fullNameSql().') LIKE ?', ['%'.$term.'%'])
                        ->orWhereRaw('LOWER(employees.first_name) LIKE ?', ['%'.$term.'%'])
                        ->orWhereRaw('LOWER(employees.last_name) LIKE ?', ['%'.$term.'%']));
                }

                continue;
            }

            if ($field === 'job_title') {
                abort_unless(is_string($value), 422, 'Position filters must be strings.');
                $term = mb_strtolower(trim($value));
                if ($term !== '') {
                    $query->where(fn (Builder $title) => $title
                        ->whereRaw('LOWER(employees.job_title) LIKE ?', ['%'.$term.'%'])
                        ->orWhereHas('position', fn (Builder $position) => $position
                            ->whereRaw('LOWER(title) LIKE ?', ['%'.$term.'%'])));
                }

                continue;
            }

            if (in_array($field, ['department', 'team', 'position'], true)) {
                abort_unless(is_string($value), 422, 'Relationship filters must be strings.');
                $term = mb_strtolower(trim($value));
                if ($term === '') {
                    continue;
                }
                $relation = match ($field) {
                    'department' => ['department', 'name'],
                    'team' => ['team', 'name'],
                    default => ['position', 'title'],
                };
                if ($field === 'position') {
                    $query->where(fn (Builder $position) => $position
                        ->whereHas('position', fn (Builder $related) => $related
                            ->whereRaw('LOWER(title) LIKE ?', ['%'.$term.'%']))
                        ->orWhereRaw('LOWER(employees.job_title) LIKE ?', ['%'.$term.'%']));
                } else {
                    $query->whereHas($relation[0], fn (Builder $related) => $related
                        ->whereRaw('LOWER('.$relation[1].') LIKE ?', ['%'.$term.'%']));
                }

                continue;
            }

            if ($field === 'manager') {
                abort_unless(is_string($value), 422, 'Manager filters must be strings.');
                $term = mb_strtolower(trim($value));
                if ($term !== '') {
                    $query->whereHas('reportingRelationships', fn (Builder $relationship) => $relationship
                        ->where('is_primary', true)
                        ->whereDate('effective_from', '<=', now()->toDateString())
                        ->where(fn (Builder $active) => $active
                            ->whereNull('effective_to')
                            ->orWhereDate('effective_to', '>=', now()->toDateString()))
                        ->whereHas('manager', fn (Builder $manager) => $manager->where(function (Builder $name) use ($term): void {
                            $name->whereRaw('LOWER('.$this->fullNameSql().') LIKE ?', ['%'.$term.'%'])
                                ->orWhereRaw('LOWER(first_name) LIKE ?', ['%'.$term.'%'])
                                ->orWhereRaw('LOWER(last_name) LIKE ?', ['%'.$term.'%']);
                        })));
                }

                continue;
            }

            if (in_array($field, ['onboarding_status', 'offboarding_status'], true)) {
                abort_unless(is_string($value), 422, 'Workflow status filters must be strings.');
                $relation = $field === 'onboarding_status' ? 'latestOnboardingCase' : 'latestOffboardingCase';
                $query->whereHas($relation, fn (Builder $case) => $case->where(function (Builder $statuses) use ($value): void {
                    $statuses->where('status', $value)->orWhere('approval_status', $value);
                }));

                continue;
            }

            if ($field === 'document_status') {
                abort_unless(is_string($value), 422, 'Document status filters must be strings.');
                $query->whereHas('employeeDocuments', fn (Builder $document) => $document->where('status', $value));

                continue;
            }

            if (in_array($field, ['employment_type', 'status'], true)) {
                abort_unless(is_string($value), 422, 'Status filters must be strings.');
                $query->where('employees.'.$field, $value);

                continue;
            }

            if (in_array($field, ['joined_at', 'passport_validity_date', 'personal_info_completed_at', 'created_at', 'updated_at'], true)) {
                abort_unless(is_array($value), 422, 'Date filters must provide a from/to range.');
                validator($value, [
                    'from' => ['nullable', 'date'],
                    'to' => ['nullable', 'date', 'after_or_equal:from'],
                ])->validate();
                if (! empty($value['from'])) {
                    $query->whereDate('employees.'.$field, '>=', $value['from']);
                }
                if (! empty($value['to'])) {
                    $query->whereDate('employees.'.$field, '<=', $value['to']);
                }

                continue;
            }

            if (in_array($field, ['id', 'number_of_children', 'nationality_id'], true)) {
                abort_unless(is_array($value), 422, 'Numeric filters must provide an operator and value.');
                validator($value, [
                    'operator' => ['required', Rule::in(['eq', 'gt', 'gte', 'lt', 'lte'])],
                    'value' => ['required', 'numeric', 'min:0'],
                ])->validate();
                $operator = ['eq' => '=', 'gt' => '>', 'gte' => '>=', 'lt' => '<', 'lte' => '<='][$value['operator']];
                $query->where('employees.'.$field, $operator, $value['value']);

                continue;
            }

            if (in_array($field, ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'], true)) {
                abort_unless(is_string($value), 422, 'Text filters must be strings.');
                $query->whereRaw('LOWER(employees.'.$field.') LIKE ?', ['%'.mb_strtolower(trim($value)).'%']);
            }
        }
    }

    private function applySort(Builder $query, string $sort, string $direction): void
    {
        $columns = [
            'id' => 'employees.id',
            'first_name' => 'employees.first_name',
            'last_name' => 'employees.last_name',
            'job_title' => 'employees.job_title',
            'employment_type' => 'employees.employment_type',
            'status' => 'employees.status',
            'location' => 'employees.location',
            'country' => 'employees.country',
            'joined_at' => 'employees.joined_at',
            'email' => 'employees.email',
            'gender' => 'employees.gender',
            'marital_status' => 'employees.marital_status',
            'number_of_children' => 'employees.number_of_children',
            'nationality_id' => 'employees.nationality_id',
            'national_id' => 'employees.national_id',
            'passport_number' => 'employees.passport_number',
            'passport_validity_date' => 'employees.passport_validity_date',
            'personal_phone' => 'employees.personal_phone',
            'professional_phone' => 'employees.professional_phone',
            'personal_info_completed_at' => 'employees.personal_info_completed_at',
            'created_at' => 'employees.created_at',
            'updated_at' => 'employees.updated_at',
        ];
        if (isset($columns[$sort])) {
            $query->orderBy($columns[$sort], $direction);

            return;
        }
        if ($sort === 'document_status') {
            $query->orderBy('documents_total_count', $direction);

            return;
        }
        if (in_array($sort, ['department', 'team', 'position'], true)) {
            $sortQuery = match ($sort) {
                'department' => Department::query()
                    ->select('name')
                    ->whereColumn('departments.id', 'employees.department_id'),
                'team' => Team::query()
                    ->select('name')
                    ->whereColumn('teams.id', 'employees.team_id'),
                default => Position::query()
                    ->select('title')
                    ->whereColumn('positions.id', 'employees.position_id'),
            };
            if ($sort === 'position') {
                $query->orderByRaw(
                    'COALESCE((SELECT positions.title FROM positions WHERE positions.id = employees.position_id), employees.job_title) '.$direction,
                );

                return;
            }
            $query->orderBy($sortQuery, $direction);

            return;
        }
        if ($sort === 'manager') {
            $managerIds = EmployeeReportingRelationship::query()
                ->select('manager_employee_id')
                ->whereColumn('employee_id', 'employees.id')
                ->where('is_primary', true)
                ->whereDate('effective_from', '<=', now()->toDateString())
                ->where(fn (Builder $active) => $active
                    ->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', now()->toDateString()))
                ->limit(1);
            $query->orderBy(
                Employee::query()->select('last_name')->whereIn('id', $managerIds),
                $direction,
            );

            return;
        }
        if (in_array($sort, ['onboarding_status', 'offboarding_status'], true)) {
            $query->orderBy(
                DB::table($sort === 'onboarding_status' ? 'onboarding_cases' : 'offboarding_cases')
                    ->select('status')
                    ->whereColumn('employee_id', 'employees.id')
                    ->orderByDesc('created_at')
                    ->limit(1),
                $direction,
            );
        }
    }

    private function fullNameSql(): string
    {
        return in_array(DB::connection()->getDriverName(), ['pgsql', 'sqlite'], true)
            ? "employees.first_name || ' ' || employees.last_name"
            : "CONCAT(employees.first_name, ' ', employees.last_name)";
    }

    public function show(Request $request, Employee $employee, EmployeeVisibility $visibility): EmployeeResource
    {
        abort_unless($visibility->canSee($request->user(), $employee), 404);

        return new EmployeeResource($employee->load(['department', 'team', 'position', 'user']));
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $this->validatedEmployee($request);

        $employee = DB::transaction(function () use ($data, $audit, $request) {
            $employee = Employee::create($data);
            $audit->record($request->user(), 'employee.created', $employee, changes: ['after' => $this->safeSnapshot($employee)]);

            return $employee;
        });

        return (new EmployeeResource($employee->load(['department', 'team', 'position', 'user'])))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Employee $employee, EmployeeVisibility $visibility, AuditLogger $audit): EmployeeResource
    {
        abort_unless($visibility->canSee($request->user(), $employee), 404);

        if ($request->user()->employee_id === $employee->id) {
            abort_unless($request->user()->hasPermission('people.employee.self.update'), 403);
            $data = $request->validate([
                'personal_phone' => ['sometimes', 'nullable', 'string', 'max:255'],
                'professional_phone' => ['sometimes', 'nullable', 'string', 'max:255'],
                'marital_status' => ['sometimes', 'nullable', Rule::in(['Single', 'Married', 'Divorced', 'Widowed'])],
                'number_of_children' => ['sometimes', 'nullable', 'integer', 'min:0'],
                'emergency_contact_name' => ['sometimes', 'nullable', 'string', 'max:255'],
                'emergency_contact_phone' => ['sometimes', 'nullable', 'string', 'max:255'],
                'emergency_contact_relationship' => ['sometimes', 'nullable', 'string', 'max:255'],
                'personal_info_dismissed_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:today'],
            ]);
            $profile = array_replace($employee->only([
                'personal_phone', 'professional_phone', 'marital_status', 'number_of_children',
                'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
            ]), $data);
            if (
                filled($profile['personal_phone'])
                && filled($profile['professional_phone'])
                && filled($profile['marital_status'])
                && $profile['number_of_children'] !== null
                && filled($profile['emergency_contact_name'])
                && filled($profile['emergency_contact_phone'])
                && filled($profile['emergency_contact_relationship'])
            ) {
                $data['personal_info_completed_at'] ??= $employee->personal_info_completed_at ?? now();
            }
        } else {
            abort_unless($request->user()->hasPermission('people.employee.update'), 403);
            $data = $this->validatedEmployee($request, true);
            $sensitiveFields = ['national_id', 'passport_number', 'passport_validity_date', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'];
            abort_if(
                array_intersect($sensitiveFields, array_keys($data)) !== []
                    && ! $request->user()->hasPermission('people.employee.sensitive.update'),
                403,
            );
        }

        $before = $this->safeSnapshot($employee);
        DB::transaction(function () use ($employee, $data, $audit, $request, $before) {
            $employee->fill($data)->save();
            if (isset($data['email']) && $employee->user) {
                $employee->user->update(['email' => $data['email']]);
            }
            $audit->record($request->user(), 'employee.updated', $employee, changes: [
                'before' => $before,
                'after' => $this->safeSnapshot($employee),
            ]);
        });

        return new EmployeeResource($employee->refresh()->load(['department', 'team', 'position', 'user']));
    }

    public function destroy(Request $request, Employee $employee, EmployeeVisibility $visibility, AuditLogger $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('people.employee.delete'), 403);
        abort_unless($visibility->canSee($request->user(), $employee), 404);

        DB::transaction(function () use ($employee, $audit, $request) {
            $before = $this->safeSnapshot($employee);
            $employee->user?->update(['is_active' => false]);
            $employee->delete();
            $audit->record($request->user(), 'employee.deleted', 'employee', $employee->id, ['before' => $before]);
        });

        return response()->json([], 204);
    }

    private function validatedEmployee(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'first_name' => [$required, 'string', 'max:100'],
            'last_name' => [$required, 'string', 'max:100'],
            'job_title' => [$required, 'string', 'max:150'],
            'department_id' => ['sometimes', 'nullable', 'uuid', 'exists:departments,id'],
            'team_id' => ['sometimes', 'nullable', 'uuid', 'exists:teams,id'],
            'position_id' => ['sometimes', 'nullable', 'uuid', 'exists:positions,id'],
            'employment_type' => ['sometimes', 'nullable', Rule::in(['Full-time', 'Part-time', 'Contractor'])],
            'status' => ['sometimes', Rule::in(['Active', 'On Leave', 'Suspended', 'Terminated'])],
            'location' => ['sometimes', 'nullable', 'string', 'max:150'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'joined_at' => ['sometimes', 'nullable', 'date'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'gender' => ['sometimes', 'nullable', Rule::in(['Male', 'Female'])],
            'marital_status' => ['sometimes', 'nullable', Rule::in(['Single', 'Married', 'Divorced', 'Widowed'])],
            'number_of_children' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'national_id' => ['sometimes', 'nullable', 'string', 'max:100'],
            'nationality_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'passport_number' => ['sometimes', 'nullable', 'string', 'max:100'],
            'passport_validity_date' => ['sometimes', 'nullable', 'date'],
            'personal_phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'professional_phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'emergency_contact_name' => ['sometimes', 'nullable', 'string', 'max:150'],
            'emergency_contact_phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'emergency_contact_relationship' => ['sometimes', 'nullable', 'string', 'max:80'],
            'personal_info_completed_at' => ['sometimes', 'nullable', 'date'],
            'personal_info_dismissed_until' => ['sometimes', 'nullable', 'date'],
        ]);

        $sensitiveFields = ['national_id', 'passport_number', 'passport_validity_date', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'];
        $sensitiveAction = $partial ? 'people.employee.sensitive.update' : 'people.employee.sensitive.create';
        abort_if(
            array_intersect($sensitiveFields, array_keys($data)) !== []
                && ! $request->user()->hasPermission($sensitiveAction),
            403,
        );

        if (isset($data['team_id']) && $data['team_id'] !== null) {
            $team = Team::findOrFail($data['team_id']);
            $departmentId = $data['department_id'] ?? $request->route('employee')?->department_id;
            if ($departmentId !== $team->department_id) {
                throw ValidationException::withMessages(['team_id' => ['The team must belong to the selected department.']]);
            }
        }

        if (isset($data['position_id'], $data['department_id']) && $data['position_id'] !== null) {
            $position = Position::findOrFail($data['position_id']);
            if ($position->department_id && $position->department_id !== $data['department_id']) {
                throw ValidationException::withMessages(['position_id' => ['The position belongs to a different department.']]);
            }
        }

        return $data;
    }

    private function safeSnapshot(Employee $employee): array
    {
        return $employee->only(['id', 'first_name', 'last_name', 'job_title', 'department_id', 'team_id', 'position_id', 'status']);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $employee = $user->employee_id
            ? Employee::with([
                'department',
                'team',
                'position',
                'user',
                'reportingRelationships' => fn ($query) => $query
                    ->where('is_primary', true)
                    ->whereDate('effective_from', '<=', now()->toDateString())
                    ->where(fn ($active) => $active
                        ->whereNull('effective_to')
                        ->orWhereDate('effective_to', '>=', now()->toDateString()))
                    ->with('manager:id,first_name,last_name'),
            ])->find($user->employee_id)
            : null;

        if (! $employee) {
            return response()->json(['message' => 'Employee profile not found'], 404);
        }

        $employeeData = new EmployeeResource($employee);

        $leaveRequests = LeaveRequest::with(['leaveType', 'backupEmployee', 'employee'])
            ->where('employee_id', $employee->id)
            ->orderByDesc('submitted_at')
            ->get()
            ->map(fn (LeaveRequest $request) => [
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
            ]);

        $leaveTypes = LeaveType::where('is_active', true)->get();

        $leaveEntitlements = LeaveEntitlement::with(['leaveType'])
            ->where('employee_id', $employee->id)
            ->where('year', now()->year)
            ->get();

        $onboardingCases = OnboardingCase::with(['tasks' => fn ($query) => $query->where('employee_visible', true)])
            ->where('employee_id', $employee->id)
            ->get();

        $offboardingCases = OffboardingCase::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('created_at')
            ->get();

        $documents = EmployeeDocument::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('uploaded_at')
            ->get(['id', 'employee_id', 'name', 'type', 'uploaded_at', 'expiry_date', 'status', 'file_path'])
            ->map(fn ($document) => [
                'id' => $document->id,
                'employee_id' => $document->employee_id,
                'name' => $document->name,
                'type' => $document->type,
                'uploaded_at' => $document->uploaded_at?->toDateString(),
                'expiry_date' => $document->expiry_date?->toDateString(),
                'status' => $document->status,
                'has_file' => filled($document->file_path),
                'issue_date' => $document->issue_date?->toDateString(),
                'mime_type' => $document->mime_type,
                'file_size' => $document->file_size,
                'review_comment' => $document->review_comment,
            ]);

        $year = now()->year;
        $holidays = Holiday::where(fn ($query) => $query
            ->whereYear('date', $year)
            ->orWhere('recurring', true))
            ->get();

        $notifications = EmployeeNotification::where('recipient_user_id', $user->id)
            ->orderByDesc('created_at')
            ->get();

        $unreadCount = EmployeeNotification::where('recipient_user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'employee' => $employeeData,
            'leaveRequests' => $leaveRequests,
            'leaveTypes' => $leaveTypes,
            'leaveEntitlements' => $leaveEntitlements,
            'onboardingCases' => $onboardingCases,
            'offboardingCases' => $offboardingCases,
            'documents' => $documents,
            'holidays' => $holidays,
            'notifications' => $notifications,
            'unreadCount' => $unreadCount,
        ]);
    }
}
