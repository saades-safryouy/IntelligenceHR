<?php

namespace Database\Seeders;

use App\Models\ApprovalAction;
use App\Models\ApprovalAssignment;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\EmployeeReportingRelationship;
use App\Models\Permission;
use App\Models\Position;
use App\Models\Role;
use App\Models\Team;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Models\WorkflowInstance;
use App\Models\WorkflowStep;
use App\Models\WorkflowTemplate;
use App\Models\WorkflowTemplateStep;
use App\Models\WorkflowTemplateVersion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class DemoDataSeeder extends Seeder
{
    private const FIXTURE_DATE = '2026-10-16';

    private array $departments = [];

    private array $teams = [];

    private array $positions = [];

    private array $employees = [];

    private array $users = [];

    private array $roles = [];

    private array $workflowVersions = [];

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Demo data can only be seeded in the local or testing environment.');
        }

        $password = config('demo.user_password');
        if (! is_string($password) || mb_strlen($password) < 14) {
            throw new RuntimeException('Set DEMO_USER_PASSWORD to a unique password of at least 14 characters in the ignored local .env file.');
        }

        DB::transaction(function () use ($password): void {
            $this->seedDepartments();
            $this->seedTeams();
            $this->seedPositions();
            $this->seedEmployees();
            $this->seedReportingRelationships();
            $this->seedUsers($password);
            $this->seedDemoRolePermissions();
            $this->seedWorkflowTemplates();
            $this->call(LeaveWorkflowSeeder::class);
            $this->seedWorkflowInstances();
            $this->seedNotifications();
        });

        $this->command?->info('Deterministic demo fixtures are present. Existing user accounts and fixture records were not overwritten.');
    }

    private function seedDepartments(): void
    {
        $definitions = [
            ['code' => 'DEMO-EXE', 'name' => '[DEMO] Executive Office', 'parent' => null],
            ['code' => 'DEMO-HR', 'name' => '[DEMO] Human Resources', 'parent' => 'DEMO-EXE'],
            ['code' => 'DEMO-FIN', 'name' => '[DEMO] Finance', 'parent' => 'DEMO-EXE'],
            ['code' => 'DEMO-ENG', 'name' => '[DEMO] Engineering', 'parent' => 'DEMO-EXE'],
            ['code' => 'DEMO-SAL', 'name' => '[DEMO] Sales', 'parent' => 'DEMO-EXE'],
            ['code' => 'DEMO-MKT', 'name' => '[DEMO] Marketing', 'parent' => 'DEMO-EXE'],
            ['code' => 'DEMO-OPS', 'name' => '[DEMO] Operations', 'parent' => 'DEMO-EXE'],
            ['code' => 'DEMO-IT', 'name' => '[DEMO] Information Technology', 'parent' => 'DEMO-EXE'],
        ];

        foreach ($definitions as $definition) {
            $department = Department::firstOrCreate(
                ['code' => $definition['code']],
                [
                    'name' => $definition['name'],
                    'parent_department_id' => $definition['parent'] ? $this->departmentId($definition['parent']) : null,
                    'is_active' => true,
                ],
            );
            $expectedParentId = $definition['parent'] ? $this->departmentId($definition['parent']) : null;
            $this->assertFixture(
                $department->name === $definition['name'] && $department->parent_department_id === $expectedParentId,
                "Department code {$definition['code']} is already used by a different record.",
            );
            $this->departments[$definition['code']] = $department;
        }
    }

    private function seedTeams(): void
    {
        foreach ($this->departments as $code => $department) {
            $teamCode = str_replace('DEMO-', 'DEMO-TEAM-', $code);
            $team = Team::firstOrCreate(
                ['department_id' => $department->id, 'code' => $teamCode],
                ['name' => '[DEMO] '.$department->name.' Team', 'is_active' => true],
            );
            $this->assertFixture(
                str_starts_with($team->name, '[DEMO] ') && $team->department_id === $department->id,
                "Team code {$teamCode} is already used by a different record.",
            );
            $this->teams[$code] = $team;
        }
    }

    private function seedPositions(): void
    {
        $definitions = [
            ['code' => 'DEMO-CEO', 'title' => '[DEMO] Chief Executive Officer', 'department' => 'DEMO-EXE', 'reports_to' => null],
            ['code' => 'DEMO-HR-DIR', 'title' => '[DEMO] HR Director', 'department' => 'DEMO-HR', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-HR-GEN', 'title' => '[DEMO] HR Generalist', 'department' => 'DEMO-HR', 'reports_to' => 'DEMO-HR-DIR'],
            ['code' => 'DEMO-HR-REC', 'title' => '[DEMO] Recruiter', 'department' => 'DEMO-HR', 'reports_to' => 'DEMO-HR-DIR'],
            ['code' => 'DEMO-FIN-DIR', 'title' => '[DEMO] Finance Director', 'department' => 'DEMO-FIN', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-FIN-ACC', 'title' => '[DEMO] Accountant', 'department' => 'DEMO-FIN', 'reports_to' => 'DEMO-FIN-DIR'],
            ['code' => 'DEMO-FIN-ANL', 'title' => '[DEMO] Financial Analyst', 'department' => 'DEMO-FIN', 'reports_to' => 'DEMO-FIN-DIR'],
            ['code' => 'DEMO-ENG-DIR', 'title' => '[DEMO] Engineering Director', 'department' => 'DEMO-ENG', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-ENG-SWE', 'title' => '[DEMO] Software Engineer', 'department' => 'DEMO-ENG', 'reports_to' => 'DEMO-ENG-DIR'],
            ['code' => 'DEMO-ENG-QA', 'title' => '[DEMO] QA Engineer', 'department' => 'DEMO-ENG', 'reports_to' => 'DEMO-ENG-DIR'],
            ['code' => 'DEMO-SAL-DIR', 'title' => '[DEMO] Sales Director', 'department' => 'DEMO-SAL', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-SAL-REP', 'title' => '[DEMO] Sales Representative', 'department' => 'DEMO-SAL', 'reports_to' => 'DEMO-SAL-DIR'],
            ['code' => 'DEMO-SAL-OPS', 'title' => '[DEMO] Sales Operations Analyst', 'department' => 'DEMO-SAL', 'reports_to' => 'DEMO-SAL-DIR'],
            ['code' => 'DEMO-MKT-DIR', 'title' => '[DEMO] Marketing Director', 'department' => 'DEMO-MKT', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-MKT-SPE', 'title' => '[DEMO] Marketing Specialist', 'department' => 'DEMO-MKT', 'reports_to' => 'DEMO-MKT-DIR'],
            ['code' => 'DEMO-OPS-DIR', 'title' => '[DEMO] Operations Director', 'department' => 'DEMO-OPS', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-OPS-COO', 'title' => '[DEMO] Operations Coordinator', 'department' => 'DEMO-OPS', 'reports_to' => 'DEMO-OPS-DIR'],
            ['code' => 'DEMO-IT-DIR', 'title' => '[DEMO] IT Director', 'department' => 'DEMO-IT', 'reports_to' => 'DEMO-CEO'],
            ['code' => 'DEMO-IT-SUP', 'title' => '[DEMO] IT Support Specialist', 'department' => 'DEMO-IT', 'reports_to' => 'DEMO-IT-DIR'],
            ['code' => 'DEMO-IT-SEC', 'title' => '[DEMO] Security Analyst', 'department' => 'DEMO-IT', 'reports_to' => 'DEMO-IT-DIR'],
        ];

        foreach ($definitions as $definition) {
            $position = Position::firstOrCreate(
                ['code' => $definition['code']],
                [
                    'department_id' => $this->departments[$definition['department']]->id,
                    'title' => $definition['title'],
                    'reports_to_position_id' => $definition['reports_to'] ? $this->positionId($definition['reports_to']) : null,
                    'is_active' => true,
                ],
            );
            $this->assertFixture(
                $position->title === $definition['title']
                    && $position->department_id === $this->departments[$definition['department']]->id
                    && $position->reports_to_position_id === ($definition['reports_to'] ? $this->positionId($definition['reports_to']) : null),
                "Position code {$definition['code']} is already used by a non-demo record.",
            );
            $this->positions[$definition['code']] = $position;
        }
    }

    private function seedEmployees(): void
    {
        $firstNames = ['Amina', 'Youssef', 'Salma', 'Omar', 'Nadia', 'Karim', 'Lina', 'Mehdi', 'Sara', 'Adam', 'Meryem', 'Anas', 'Imane', 'Rayan', 'Hana', 'Samir', 'Leila', 'Amine', 'Zineb', 'Ilyas'];
        $lastNames = ['Bennani', 'El Amrani', 'Alaoui', 'Idrissi', 'Tazi'];
        $onLeave = [13, 26, 39, 52, 65, 78, 91, 98];
        $suspended = [19, 43, 67];
        $terminated = [17, 34, 51, 68, 85];

        for ($number = 1; $number <= 100; $number++) {
            $departmentCode = $number === 1
                ? 'DEMO-EXE'
                : ($number <= 8 ? array_keys($this->departments)[$number - 1] : array_keys($this->departments)[1 + (($number - 9) % 7)]);
            $positionCode = $this->employeePositionCode($number, $departmentCode);
            $firstName = $firstNames[($number - 1) % count($firstNames)];
            $lastName = $lastNames[intdiv($number - 1, count($firstNames))];
            $status = in_array($number, $onLeave, true) ? 'On Leave'
                : (in_array($number, $suspended, true) ? 'Suspended'
                    : (in_array($number, $terminated, true) ? 'Terminated' : 'Active'));
            $year = 2017 + (($number - 1) % 10);
            $month = 1 + (($number * 7) % 12);
            $day = 1 + (($number * 3) % 27);
            if ($year === 2026 && ($month > 10 || ($month === 10 && $day > 16))) {
                $year = 2025;
            }
            $employee = Employee::firstOrCreate(
                ['email' => sprintf('demo.employee.%03d@intelligence-rh.example.test', $number)],
                [
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'job_title' => $this->positions[$positionCode]->title,
                    'department_id' => $this->departments[$departmentCode]->id,
                    'team_id' => $this->teams[$departmentCode]->id,
                    'position_id' => $this->positions[$positionCode]->id,
                    'employment_type' => $number % 10 === 0 ? 'Part-time' : 'Full-time',
                    'status' => $status,
                    'location' => ['Casablanca', 'Rabat', 'Tangier', 'Marrakesh'][$number % 4],
                    'country' => 'MA',
                    'joined_at' => CarbonImmutable::create($year, $month, $day)->toDateString(),
                    'gender' => $number % 2 === 0 ? 'Female' : 'Male',
                ],
            );
            $this->assertFixture(
                $employee->first_name === $firstName
                    && $employee->last_name === $lastName
                    && $employee->department_id === $this->departments[$departmentCode]->id
                    && $employee->team_id === $this->teams[$departmentCode]->id
                    && $employee->position_id === $this->positions[$positionCode]->id,
                "Demo employee email {$employee->email} is already used by a different record.",
            );
            $this->employees[$number] = $employee;
        }
    }

    private function employeePositionCode(int $number, string $departmentCode): string
    {
        if ($number === 1) {
            return 'DEMO-CEO';
        }

        if ($number <= 8) {
            return array_values(['DEMO-HR-DIR', 'DEMO-FIN-DIR', 'DEMO-ENG-DIR', 'DEMO-SAL-DIR', 'DEMO-MKT-DIR', 'DEMO-OPS-DIR', 'DEMO-IT-DIR'])[$number - 2];
        }

        $specialists = [
            'DEMO-HR' => ['DEMO-HR-GEN', 'DEMO-HR-REC'],
            'DEMO-FIN' => ['DEMO-FIN-ACC', 'DEMO-FIN-ANL'],
            'DEMO-ENG' => ['DEMO-ENG-SWE', 'DEMO-ENG-QA'],
            'DEMO-SAL' => ['DEMO-SAL-REP', 'DEMO-SAL-OPS'],
            'DEMO-MKT' => ['DEMO-MKT-SPE'],
            'DEMO-OPS' => ['DEMO-OPS-COO'],
            'DEMO-IT' => ['DEMO-IT-SUP', 'DEMO-IT-SEC'],
        ];

        $options = $specialists[$departmentCode];

        return $options[($number - 9) % count($options)];
    }

    private function seedReportingRelationships(): void
    {
        for ($number = 2; $number <= 100; $number++) {
            $managerNumber = $number <= 8 ? 1 : $this->departmentHeadNumber($this->employees[$number]->department_id);
            $employee = $this->employees[$number];
            $manager = $this->employees[$managerNumber];
            $effectiveFrom = CarbonImmutable::parse(max(
                $employee->joined_at->toDateString(),
                $manager->joined_at->toDateString(),
            ));
            $existing = EmployeeReportingRelationship::query()
                ->where('employee_id', $employee->id)
                ->where('is_primary', true)
                ->whereDate('effective_from', '<=', self::FIXTURE_DATE)
                ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', self::FIXTURE_DATE))
                ->first();

            if ($existing) {
                $this->assertFixture((int) $existing->manager_employee_id === (int) $manager->id, "Demo employee {$number} already has a different active primary manager.");

                continue;
            }

            EmployeeReportingRelationship::firstOrCreate(
                [
                    'employee_id' => $employee->id,
                    'manager_employee_id' => $manager->id,
                    'is_primary' => true,
                    'effective_from' => $effectiveFrom->toDateString(),
                ],
                ['effective_to' => null, 'created_by' => null],
            );
        }
    }

    private function departmentHeadNumber(string $departmentId): int
    {
        foreach (range(2, 8) as $number) {
            if ($this->employees[$number]->department_id === $departmentId) {
                return $number;
            }
        }

        throw new RuntimeException('A demo department has no assigned department head.');
    }

    private function seedUsers(string $password): void
    {
        $this->roles = Role::query()->get()->keyBy('key')->all();
        $this->assertFixture(count($this->roles) === 6, 'The six proposed RBAC roles must be seeded before demo accounts.');
        $this->assertFixture(Permission::query()->count() === 42, 'The 42 proposed RBAC permissions must be seeded before demo accounts.');

        $this->users['hr'] = $this->demoUser(
            'demo.hr.admin@intelligence-rh.example.test',
            '[DEMO] HR Administrator',
            null,
            $password,
        );
        $this->assignRole($this->users['hr'], 'hr-admin');

        $this->users['ceo'] = $this->demoUser(
            'demo.ceo@intelligence-rh.example.test',
            '[DEMO] Chief Executive Officer',
            $this->employees[1]->id,
            $password,
        );
        $this->assignRole($this->users['ceo'], 'workflow-approver');

        foreach (range(2, 8) as $number) {
            $departmentCode = array_keys($this->departments)[$number - 1];
            $manager = $this->demoUser(
                sprintf('demo.manager.%02d@intelligence-rh.example.test', $number - 1),
                '[DEMO] '.$this->employees[$number]->first_name.' '.$this->employees[$number]->last_name.' Manager',
                $this->employees[$number]->id,
                $password,
            );
            $this->users['manager:'.$departmentCode] = $manager;
            $this->assignRole($manager, 'department-manager');
            $this->assignRole($manager, 'workflow-approver');
            $this->assignDepartmentScope($manager, $this->departments[$departmentCode]);
        }

        $employeeNumbers = [9, 10, 11, 12, 14, 15, 16, 18, 20, 21, 22, 23];
        foreach ($employeeNumbers as $accountNumber => $number) {
            $employee = $this->employees[$number];
            $user = $this->demoUser(
                sprintf('demo.employee.%02d@intelligence-rh.example.test', $accountNumber + 1),
                '[DEMO] '.$employee->first_name.' '.$employee->last_name,
                $employee->id,
                $password,
            );
            $this->users['employee:'.$number] = $user;
            $this->assignRole($user, 'employee');
        }
    }

    private function demoUser(string $email, string $name, ?int $employeeId, string $password): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => $name, 'password' => $password, 'employee_id' => $employeeId, 'is_active' => true],
        );
        $this->assertFixture(
            $user->name === $name && $user->employee_id === $employeeId && $user->is_active,
            "Demo login {$email} already exists with different account details; it was not modified.",
        );

        return $user;
    }

    private function assignRole(User $user, string $roleKey): void
    {
        $role = $this->roles[$roleKey] ?? null;
        $this->assertFixture($role instanceof Role, "Required demo role {$roleKey} is missing.");
        DB::table('user_roles')->insertOrIgnore([
            'user_id' => $user->id,
            'role_id' => $role->id,
            'assigned_by' => null,
            'valid_from' => null,
            'valid_until' => null,
            'created_at' => CarbonImmutable::parse(self::FIXTURE_DATE),
            'updated_at' => CarbonImmutable::parse(self::FIXTURE_DATE),
        ]);
    }

    private function assignDepartmentScope(User $user, Department $department): void
    {
        $exists = DB::table('role_scope_assignments')
            ->where('user_id', $user->id)
            ->where('scope_kind', 'department')
            ->where('scope_id', $department->id)
            ->exists();
        if ($exists) {
            return;
        }

        DB::table('role_scope_assignments')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'role_id' => null,
            'scope_kind' => 'department',
            'scope_id' => $department->id,
            'valid_from' => null,
            'valid_until' => null,
            'assigned_by' => null,
            'created_at' => CarbonImmutable::parse(self::FIXTURE_DATE),
            'updated_at' => CarbonImmutable::parse(self::FIXTURE_DATE),
        ]);
    }

    private function seedDemoRolePermissions(): void
    {
        $grants = [
            'hr-admin' => [
                'people.employee.view.all', 'people.employee.create', 'people.employee.update',
                'people.document.upload', 'people.document.review', 'people.document.archive', 'people.document.delete',
                'people.catalog.view', 'organigram.view', 'rbac.role.view', 'rbac.permission.view',
                'rbac.user_role.view', 'workflow.template.view', 'workflow.instance.view.all',
                'workflow.instance.start', 'workflow.approve', 'workflow.history.view',
                'notification.view', 'audit.view',
            ],
            'department-manager' => [
                'people.employee.view.department', 'people.catalog.view', 'organigram.view',
                'workflow.instance.view', 'workflow.approve', 'workflow.history.view', 'notification.view',
            ],
            'workflow-approver' => [
                'workflow.instance.view', 'workflow.approve', 'workflow.history.view', 'notification.view',
            ],
            'employee' => [
                'people.employee.self.view', 'people.employee.self.update', 'people.document.upload',
                'workflow.instance.view', 'notification.view',
            ],
        ];

        foreach ($grants as $roleKey => $permissionKeys) {
            $role = $this->roles[$roleKey];
            $permissionIds = Permission::query()->whereIn('key', $permissionKeys)->pluck('id', 'key');
            $this->assertFixture($permissionIds->count() === count($permissionKeys), "Some demo permissions for {$roleKey} are missing.");
            foreach ($permissionIds as $permissionId) {
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $role->id,
                    'permission_id' => $permissionId,
                    'created_at' => CarbonImmutable::parse(self::FIXTURE_DATE),
                    'updated_at' => CarbonImmutable::parse(self::FIXTURE_DATE),
                ]);
            }
        }
    }

    private function seedWorkflowTemplates(): void
    {
        $definitions = [
            'demo.sequential-approval' => [
                'name' => '[DEMO] Sequential approval',
                'steps' => [
                    ['key' => 'manager-review', 'sequence' => 1, 'group_key' => 'manager', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'approver_rule' => ['type' => 'manager_chain', 'levels' => 1]],
                    ['key' => 'hr-review', 'sequence' => 2, 'group_key' => 'hr', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'approver_rule' => ['type' => 'role', 'role_key' => 'hr-admin']],
                ],
            ],
            'demo.parallel-approval' => [
                'name' => '[DEMO] Parallel approval',
                'steps' => [
                    ['key' => 'management-review', 'sequence' => 1, 'group_key' => 'management', 'mode' => 'parallel', 'completion_rule' => 'all', 'quorum' => null, 'approver_rule' => ['type' => 'manager_chain', 'levels' => 2]],
                ],
            ],
        ];

        foreach ($definitions as $key => $definition) {
            $template = WorkflowTemplate::firstOrCreate(
                ['key' => $key],
                ['module' => 'e-flow', 'resource_type' => 'demo_request', 'name' => $definition['name'], 'is_active' => true, 'created_by' => $this->users['hr']->id],
            );
            $this->assertFixture($template->name === $definition['name'], "Workflow template {$key} is already used by a non-demo record.");
            $version = WorkflowTemplateVersion::firstOrCreate(
                ['workflow_template_id' => $template->id, 'version_number' => 1],
                ['status' => 'published', 'published_at' => CarbonImmutable::parse(self::FIXTURE_DATE), 'published_by' => $this->users['hr']->id],
            );
            $this->assertFixture($version->status === 'published', "Demo workflow template {$key} has an unexpected version state.");

            foreach ($definition['steps'] as $step) {
                WorkflowTemplateStep::firstOrCreate(
                    ['workflow_template_version_id' => $version->id, 'key' => $step['key']],
                    $step,
                );
            }
            $this->workflowVersions[$key] = $version->load('steps');
        }
    }

    private function seedWorkflowInstances(): void
    {
        $definitions = [
            ['template' => 'demo.sequential-approval', 'status' => 'pending_approval', 'initiator' => 9],
            ['template' => 'demo.parallel-approval', 'status' => 'pending_approval', 'initiator' => 10],
            ['template' => 'demo.sequential-approval', 'status' => 'pending_approval', 'initiator' => 11],
            ['template' => 'demo.parallel-approval', 'status' => 'pending_approval', 'initiator' => 12],
            ['template' => 'demo.sequential-approval', 'status' => 'pending_approval', 'initiator' => 14],
            ['template' => 'demo.parallel-approval', 'status' => 'pending_approval', 'initiator' => 14],
            ['template' => 'demo.sequential-approval', 'status' => 'pending_approval', 'initiator' => 15],
            ['template' => 'demo.sequential-approval', 'status' => 'pending_approval', 'initiator' => 18],
            ['template' => 'demo.sequential-approval', 'status' => 'approved', 'initiator' => 20],
            ['template' => 'demo.sequential-approval', 'status' => 'approved', 'initiator' => 21],
            ['template' => 'demo.sequential-approval', 'status' => 'approved', 'initiator' => 22],
            ['template' => 'demo.sequential-approval', 'status' => 'approved', 'initiator' => 23],
            ['template' => 'demo.parallel-approval', 'status' => 'approved', 'initiator' => 9],
            ['template' => 'demo.sequential-approval', 'status' => 'rejected', 'initiator' => 9],
            ['template' => 'demo.parallel-approval', 'status' => 'returned_for_correction', 'initiator' => 11],
        ];

        foreach ($definitions as $index => $definition) {
            $number = $index + 1;
            $version = $this->workflowVersions[$definition['template']];
            $submittedAt = CarbonImmutable::parse(self::FIXTURE_DATE)->subDays(45 - $number * 2);
            $completed = in_array($definition['status'], ['approved', 'rejected', 'returned_for_correction'], true);
            $instance = WorkflowInstance::firstOrCreate(
                ['idempotency_key' => sprintf('demo-workflow-%03d', $number)],
                [
                    'workflow_template_version_id' => $version->id,
                    'initiator_user_id' => $this->users['employee:'.$definition['initiator']]->id,
                    'resource_type' => 'demo_request',
                    'resource_id' => sprintf('DEMO-REQUEST-%03d', $number),
                    'status' => $definition['status'],
                    'submitted_at' => $submittedAt,
                    'completed_at' => $completed ? $submittedAt->addDays(2) : null,
                ],
            );
            $this->assertFixture($instance->resource_type === 'demo_request', 'A demo workflow idempotency key is already used by another resource.');

            foreach ($version->steps as $templateStep) {
                $step = $this->createWorkflowStep($instance, $templateStep, $definition['status']);
                $approvers = $this->workflowApprovers($instance, $templateStep);
                $this->createAssignmentsAndActions($instance, $step, $approvers, $definition['status'], $number, $submittedAt);
            }

            $this->createWorkflowEvent($instance, 'submitted', null, 'pending_approval', $submittedAt);
            if ($completed) {
                $event = match ($definition['status']) {
                    'approved' => 'approved',
                    'rejected' => 'reject',
                    default => 'return',
                };
                $this->createWorkflowEvent($instance, $event, 'pending_approval', $definition['status'], $submittedAt->addDays(2));
            }
        }
    }

    private function createWorkflowStep(WorkflowInstance $instance, WorkflowTemplateStep $templateStep, string $instanceStatus): WorkflowStep
    {
        $stepStatus = match (true) {
            $instanceStatus === 'approved' => 'approved',
            $instanceStatus === 'rejected' && $templateStep->sequence === 1 => 'rejected',
            $instanceStatus === 'rejected' => 'cancelled',
            $instanceStatus === 'returned_for_correction' => 'returned_for_correction',
            $templateStep->sequence === 1 => 'active',
            default => 'queued',
        };

        return WorkflowStep::firstOrCreate(
            ['workflow_instance_id' => $instance->id, 'key' => $templateStep->key],
            [
                'workflow_template_step_id' => $templateStep->id,
                'sequence' => $templateStep->sequence,
                'group_key' => $templateStep->group_key,
                'mode' => $templateStep->mode,
                'completion_rule' => $templateStep->completion_rule,
                'quorum' => $templateStep->quorum,
                'status' => $stepStatus,
                'approver_rule' => $templateStep->approver_rule,
                'activated_at' => $templateStep->sequence === 1 ? CarbonImmutable::parse(self::FIXTURE_DATE)->subDays(30) : null,
                'completed_at' => in_array($stepStatus, ['approved', 'rejected', 'returned_for_correction'], true)
                    ? CarbonImmutable::parse(self::FIXTURE_DATE)->subDays(1)
                    : null,
            ],
        );
    }

    private function workflowApprovers(WorkflowInstance $instance, WorkflowTemplateStep $templateStep): array
    {
        $initiator = User::query()->with('employee')->findOrFail($instance->initiator_user_id);
        $managerEmployeeId = EmployeeReportingRelationship::query()
            ->where('employee_id', $initiator->employee_id)
            ->where('is_primary', true)
            ->whereDate('effective_from', '<=', self::FIXTURE_DATE)
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', self::FIXTURE_DATE))
            ->value('manager_employee_id');
        $this->assertFixture($managerEmployeeId !== null, 'A demo workflow initiator has no active manager relationship.');
        $manager = User::query()->where('employee_id', $managerEmployeeId)->firstOrFail();

        if ($templateStep->approver_rule['type'] === 'role') {
            return [$this->users['hr']];
        }
        if (($templateStep->approver_rule['levels'] ?? 1) === 1) {
            return [$manager];
        }

        return [$manager, $this->users['ceo']];
    }

    private function createAssignmentsAndActions(
        WorkflowInstance $instance,
        WorkflowStep $step,
        array $approvers,
        string $status,
        int $instanceNumber,
        CarbonImmutable $submittedAt,
    ): void {
        foreach ($approvers as $index => $approver) {
            $sequenceOrder = $index + 1;
            $sourceId = match ($step->approver_rule['type']) {
                'manager_chain' => (string) $approver->employee_id,
                'role' => (string) $step->approver_rule['role_key'],
                default => $approver->id,
            };
            $existingAtSequence = ApprovalAssignment::query()
                ->where('workflow_step_id', $step->id)
                ->where('sequence_order', $sequenceOrder)
                ->first();
            if ($existingAtSequence) {
                $this->assertFixture(
                    $existingAtSequence->approver_user_id === $approver->id,
                    "Demo workflow {$instance->idempotency_key} has an existing approver assignment that differs from the fixture.",
                );
            }
            $action = match (true) {
                $status === 'approved' => 'approve',
                $status === 'rejected' && $step->sequence === 1 && $index === 0 => 'reject',
                $status === 'returned_for_correction' && $index === 0 => 'return',
                default => null,
            };
            $assignmentStatus = match (true) {
                $action === 'approve' => 'approved',
                $action === 'reject' => 'rejected',
                $action === 'return' => 'return',
                $status === 'rejected' || $status === 'returned_for_correction' => 'cancelled',
                $step->status === 'queued' => 'queued',
                default => 'pending',
            };
            $occurredAt = $submittedAt->addDay();
            $assignment = ApprovalAssignment::firstOrCreate(
                ['workflow_step_id' => $step->id, 'approver_user_id' => $approver->id],
                [
                    'sequence_order' => $sequenceOrder,
                    'source_type' => $step->approver_rule['type'],
                    'source_id' => $sourceId,
                    'status' => $assignmentStatus,
                    'activated_at' => $assignmentStatus === 'queued' ? null : $submittedAt,
                    'resolved_at' => in_array($assignmentStatus, ['approved', 'rejected', 'return', 'cancelled'], true) ? $occurredAt : null,
                ],
            );

            if ($action !== null) {
                ApprovalAction::firstOrCreate(
                    ['actor_user_id' => $approver->id, 'idempotency_key' => sprintf('demo-action-%03d-%s', $instanceNumber, $step->key.'-'.$index)],
                    [
                        'workflow_instance_id' => $instance->id,
                        'workflow_step_id' => $step->id,
                        'assignment_id' => $assignment->id,
                        'action' => $action,
                        'comment' => $action === 'approve' ? 'Demo approval recorded.' : 'Demo request requires follow-up.',
                        'occurred_at' => $occurredAt,
                    ],
                );
            }
        }
    }

    private function createWorkflowEvent(
        WorkflowInstance $instance,
        string $type,
        ?string $fromStatus,
        ?string $toStatus,
        CarbonImmutable $occurredAt,
    ): void {
        WorkflowEvent::firstOrCreate(
            ['workflow_instance_id' => $instance->id, 'idempotency_key' => 'demo-event-'.$type],
            [
                'actor_user_id' => $this->users['hr']->id,
                'event_type' => $type,
                'from_status' => $fromStatus,
                'to_status' => $toStatus,
                'data' => ['demo' => true],
                'correlation_id' => (string) Str::uuid(),
                'occurred_at' => $occurredAt,
            ],
        );
    }

    private function seedNotifications(): void
    {
        $users = array_values($this->users);
        $types = [
            ['workflow.activity', 'Workflow update', 'A demo workflow has a new activity.'],
            ['hr.alert', 'HR review reminder', 'A demo HR record is ready for review.'],
            ['employee.reminder', 'Profile reminder', 'Please review your demo employee profile.'],
        ];

        for ($number = 1; $number <= 24; $number++) {
            [$type, $title, $body] = $types[($number - 1) % count($types)];
            $user = $users[($number - 1) % count($users)];
            EmployeeNotification::firstOrCreate(
                ['deduplication_key' => sprintf('demo-notification-%03d', $number)],
                [
                    'recipient_user_id' => $user->id,
                    'type' => $type,
                    'title' => '[DEMO] '.$title,
                    'body' => $body,
                    'resource_type' => 'demo_request',
                    'resource_id' => sprintf('DEMO-REQUEST-%03d', (($number - 1) % 15) + 1),
                    'read_at' => $number % 4 === 0 ? CarbonImmutable::parse(self::FIXTURE_DATE)->subDays(1) : null,
                ],
            );
        }

        $pendingAssignments = ApprovalAssignment::query()
            ->whereHas('step.instance', fn ($query) => $query->where('idempotency_key', 'like', 'demo-workflow-%')->where('status', 'pending_approval'))
            ->where('status', 'pending')
            ->get();
        foreach ($pendingAssignments as $assignment) {
            EmployeeNotification::firstOrCreate(
                ['deduplication_key' => 'demo-workflow-reminder:'.$assignment->id],
                [
                    'recipient_user_id' => $assignment->approver_user_id,
                    'type' => 'workflow.approval_required',
                    'title' => '[DEMO] Approval reminder',
                    'body' => 'A demo workflow item is waiting for your decision.',
                    'resource_type' => 'workflow_instance',
                    'resource_id' => $assignment->step->workflow_instance_id,
                ],
            );
        }
    }

    private function departmentId(string $code): string
    {
        return $this->departments[$code]->id;
    }

    private function positionId(string $code): string
    {
        return $this->positions[$code]->id;
    }

    private function assertFixture(bool $condition, string $message): void
    {
        if (! $condition) {
            throw new RuntimeException($message);
        }
    }
}
