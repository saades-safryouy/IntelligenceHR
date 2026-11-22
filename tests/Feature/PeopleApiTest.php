<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\EmployeeReportingRelationship;
use App\Models\Position;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class PeopleApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    public function test_people_list_is_server_paginated_and_sensitive_fields_are_redacted(): void
    {
        $department = Department::create(['code' => 'eng', 'name' => 'Engineering']);
        $first = Employee::factory()->create([
            'department_id' => $department->id,
            'first_name' => 'Alex',
            'national_id' => 'SENSITIVE-001',
        ]);
        Employee::factory()->create(['department_id' => $department->id, 'first_name' => 'Avery']);
        $user = $this->createUserWithPermissions(['people.employee.view.all']);

        $response = $this->actingAs($user)->getJson('/api/v1/employees?q=Alex&page=1&pageSize=1');

        $response->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $first->id)
            ->assertJsonPath('data.0.documentStatusCounts.total', 0)
            ->assertJsonPath('data.0.jobTitle', $first->job_title)
            ->assertJsonMissingPath('data.0.nationalId');
    }

    public function test_people_column_filters_combine_with_and_and_preserve_sort_and_pagination(): void
    {
        $department = Department::create(['code' => 'filter-eng', 'name' => 'Engineering']);
        $position = Position::create(['department_id' => $department->id, 'code' => 'filter-analyst', 'title' => 'Analyst']);
        $manager = Employee::factory()->create(['first_name' => 'Morgan', 'last_name' => 'Manager']);
        $older = Employee::factory()->create([
            'department_id' => $department->id,
            'position_id' => $position->id,
            'first_name' => 'Alex',
            'employment_type' => 'Full-time',
            'location' => 'Paris',
            'joined_at' => '2025-03-01',
            'status' => 'Active',
        ]);
        $newer = Employee::factory()->create([
            'department_id' => $department->id,
            'position_id' => $position->id,
            'first_name' => 'Alexandra',
            'employment_type' => 'Full-time',
            'location' => 'Paris',
            'joined_at' => '2025-09-01',
            'status' => 'Active',
        ]);
        Employee::factory()->create([
            'department_id' => $department->id,
            'position_id' => $position->id,
            'first_name' => 'Alex',
            'employment_type' => 'Contractor',
            'location' => 'London',
            'joined_at' => '2025-07-01',
            'status' => 'Active',
        ]);
        EmployeeReportingRelationship::create([
            'employee_id' => $older->id,
            'manager_employee_id' => $manager->id,
            'is_primary' => true,
            'effective_from' => now()->toDateString(),
        ]);
        EmployeeReportingRelationship::create([
            'employee_id' => $newer->id,
            'manager_employee_id' => $manager->id,
            'is_primary' => true,
            'effective_from' => now()->toDateString(),
        ]);
        EmployeeDocument::create([
            'employee_id' => $older->id,
            'name' => 'Identity record',
            'type' => 'identity',
            'uploaded_at' => today(),
            'status' => 'approved',
        ]);

        $user = $this->createUserWithPermissions(['people.employee.view.all']);
        $query = http_build_query([
            'page' => 1,
            'pageSize' => 1,
            'sort' => 'joined_at',
            'order' => 'desc',
            'filters' => [
                'full_name' => 'ale',
                'department' => 'ENGINEER',
                'position' => 'analyst',
                'manager' => 'morgan manager',
                'employment_type' => 'Full-time',
                'location' => 'par',
                'joined_at' => ['from' => '2025-01-01', 'to' => '2025-12-31'],
                'id' => ['operator' => 'gte', 'value' => $older->id],
            ],
        ]);
        $pageOne = $this->actingAs($user)->getJson('/api/v1/employees?'.$query);
        $pageOne->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('pageSize', 1)
            ->assertJsonPath('data.0.id', $newer->id);

        $pageTwo = $this->getJson('/api/v1/employees?'.str_replace('page=1', 'page=2', $query));
        $pageTwo->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('data.0.id', $older->id)
            ->assertJsonPath('data.0.department', 'Engineering')
            ->assertJsonPath('data.0.position', 'Analyst')
            ->assertJsonPath('data.0.manager', 'Morgan Manager')
            ->assertJsonPath('data.0.documentStatusCounts.approved', 1)
            ->assertJsonPath('data.0.createdAt', $older->created_at->toISOString());

        foreach (['department', 'team', 'position', 'manager', 'onboarding_status', 'offboarding_status'] as $sort) {
            $response = $this->getJson('/api/v1/employees?sort='.$sort.'&order=asc');
            $this->assertSame(200, $response->status(), $sort.': '.$response->getContent());
        }
    }

    public function test_people_column_filters_enforce_privacy_and_reject_unknown_fields(): void
    {
        Employee::factory()->create(['national_id' => 'PRIVATE-ID-91', 'number_of_children' => 3]);
        $user = $this->createUserWithPermissions(['people.employee.view.all']);

        $this->actingAs($user)->getJson('/api/v1/employees?filters[national_id]=PRIVATE-ID')
            ->assertForbidden();
        $this->getJson('/api/v1/employees?filters[unknown_field]=value')
            ->assertUnprocessable();
        $this->getJson('/api/v1/employees?sort=national_id')
            ->assertForbidden();

        $authorized = $this->createUserWithPermissions([
            'people.employee.view.all',
            'people.employee.sensitive.view',
            'people.employee.family.view',
        ]);
        $this->actingAs($authorized)->getJson('/api/v1/employees?filters[national_id]=PRIVATE-ID')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.nationalId', 'PRIVATE-ID-91');

        $this->actingAs($authorized)->getJson('/api/v1/employees?filters[number_of_children][operator]=gte&filters[number_of_children][value]=2')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.numberOfChildren', 3);

        $this->getJson('/api/v1/employees?filters[status]=unsupported')
            ->assertUnprocessable();
    }

    public function test_department_scope_limits_visibility_to_assigned_department(): void
    {
        $department = Department::create(['code' => 'ops', 'name' => 'Operations']);
        $otherDepartment = Department::create(['code' => 'fin', 'name' => 'Finance']);
        $visible = Employee::factory()->create(['department_id' => $department->id]);
        Employee::factory()->create(['department_id' => $otherDepartment->id]);
        $user = $this->createUserWithPermissions(['people.employee.view.department']);
        $roleId = $user->roles()->firstOrFail()->id;
        \DB::table('role_scope_assignments')->insert([
            'id' => (string) Str::uuid(),
            'role_id' => $roleId,
            'scope_kind' => 'department',
            'scope_id' => $department->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user)->getJson('/api/v1/employees')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $visible->id);

        $this->getJson('/api/v1/employees?filters[first_name]='.$visible->first_name)
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $visible->id);
    }

    public function test_employee_crud_is_authorized_audited_and_soft_deleted(): void
    {
        $user = $this->createUserWithPermissions([
            'people.employee.create',
            'people.employee.view.all',
            'people.employee.update',
            'people.employee.delete',
        ]);

        $created = $this->actingAs($user)->postJson('/api/v1/employees', [
            'first_name' => 'Jordan',
            'last_name' => 'Example',
            'job_title' => 'People Analyst',
            'status' => 'Active',
        ])->assertCreated()->assertJsonPath('data.firstName', 'Jordan');
        $employeeId = $created->json('data.id');

        $this->assertDatabaseHas('audit_logs', ['action' => 'employee.created', 'target_id' => (string) $employeeId]);

        $this->patchJson('/api/v1/employees/'.$employeeId, ['job_title' => 'HR Analyst'])
            ->assertOk()
            ->assertJsonPath('data.jobTitle', 'HR Analyst');

        $this->deleteJson('/api/v1/employees/'.$employeeId)->assertNoContent();
        $this->assertSoftDeleted('employees', ['id' => $employeeId]);
    }

    public function test_inconsistent_team_department_is_rejected(): void
    {
        $departmentA = Department::create(['code' => 'a', 'name' => 'Department A']);
        $departmentB = Department::create(['code' => 'b', 'name' => 'Department B']);
        $team = Team::create(['department_id' => $departmentA->id, 'code' => 'a1', 'name' => 'Team A1']);
        $user = $this->createUserWithPermissions(['people.employee.create']);

        $this->actingAs($user)->postJson('/api/v1/employees', [
            'first_name' => 'Jordan',
            'last_name' => 'Example',
            'job_title' => 'Analyst',
            'department_id' => $departmentB->id,
            'team_id' => $team->id,
        ])->assertUnprocessable();
    }

    public function test_manager_relationships_support_roots_and_reject_cycles(): void
    {
        $user = $this->createUserWithPermissions(['people.reporting.update', 'people.employee.view.all', 'organigram.view']);
        $top = Employee::factory()->create();
        $middle = Employee::factory()->create();
        $leaf = Employee::factory()->create();
        $date = now()->toDateString();

        $this->actingAs($user)->putJson("/api/v1/employees/{$middle->id}/reporting-relationships", [
            'managerEmployeeId' => $top->id,
            'effectiveFrom' => $date,
        ])->assertCreated();
        $this->putJson("/api/v1/employees/{$leaf->id}/reporting-relationships", [
            'managerEmployeeId' => $middle->id,
            'effectiveFrom' => $date,
        ])->assertCreated();

        $this->putJson("/api/v1/employees/{$top->id}/reporting-relationships", [
            'managerEmployeeId' => $leaf->id,
            'effectiveFrom' => $date,
        ])->assertUnprocessable();

        $this->getJson('/api/v1/org-chart')
            ->assertOk()
            ->assertJsonPath('data.0.employeeId', $top->id)
            ->assertJsonPath('data.0.children.0.employeeId', $middle->id)
            ->assertJsonPath('data.0.children.0.children.0.employeeId', $leaf->id);
    }

    public function test_reporting_relationship_updates_reject_self_management_and_require_permission(): void
    {
        $employee = Employee::factory()->create();
        $authorized = $this->createUserWithPermissions(['people.reporting.update']);
        $date = now()->toDateString();

        $this->actingAs($authorized)->putJson("/api/v1/employees/{$employee->id}/reporting-relationships", [
            'managerEmployeeId' => $employee->id,
            'effectiveFrom' => $date,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('managerEmployeeId');

        $unauthorized = $this->createUserWithPermissions([]);
        $this->actingAs($unauthorized)->putJson("/api/v1/employees/{$employee->id}/reporting-relationships", [
            'managerEmployeeId' => null,
            'effectiveFrom' => $date,
        ])->assertForbidden();
    }

    public function test_unassigned_employees_are_valid_chart_roots(): void
    {
        $user = $this->createUserWithPermissions(['people.employee.view.all', 'organigram.view']);
        $root = Employee::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/org-chart')
            ->assertOk()
            ->assertJsonPath('data.0.employeeId', $root->id);
    }

    public function test_same_day_reporting_assignment_can_be_removed_without_invalid_dates(): void
    {
        $user = $this->createUserWithPermissions(['people.reporting.update']);
        $employee = Employee::factory()->create();
        $manager = Employee::factory()->create();
        $date = now()->toDateString();

        $this->actingAs($user)->putJson("/api/v1/employees/{$employee->id}/reporting-relationships", [
            'managerEmployeeId' => $manager->id,
            'effectiveFrom' => $date,
        ])->assertCreated();

        $this->putJson("/api/v1/employees/{$employee->id}/reporting-relationships", [
            'managerEmployeeId' => null,
            'effectiveFrom' => $date,
        ])->assertCreated()->assertJsonPath('data', null);

        $this->assertDatabaseMissing('employee_reporting_relationships', [
            'employee_id' => $employee->id,
            'manager_employee_id' => $manager->id,
        ]);
    }

    public function test_org_chart_reports_cycles_in_components_without_a_root(): void
    {
        $user = $this->createUserWithPermissions(['people.employee.view.all', 'organigram.view']);
        Employee::factory()->create(['first_name' => 'Root']);
        $first = Employee::factory()->create(['first_name' => 'Cycle A']);
        $second = Employee::factory()->create(['first_name' => 'Cycle B']);
        $date = now()->toDateString();
        EmployeeReportingRelationship::create([
            'employee_id' => $first->id,
            'manager_employee_id' => $second->id,
            'is_primary' => true,
            'effective_from' => $date,
        ]);
        EmployeeReportingRelationship::create([
            'employee_id' => $second->id,
            'manager_employee_id' => $first->id,
            'is_primary' => true,
            'effective_from' => $date,
        ]);

        $this->actingAs($user)->getJson('/api/v1/org-chart')
            ->assertOk()
            ->assertJsonPath('meta.cycleDetected', true)
            ->assertJsonCount(2, 'data');
    }

    public function test_employee_org_chart_is_limited_to_visible_employees_but_shows_own_manager_relationship(): void
    {
        $manager = Employee::factory()->create([
            'first_name' => 'Private',
            'last_name' => 'Manager',
            'national_id' => 'DO-NOT-EXPOSE',
        ]);
        $employee = Employee::factory()->create(['first_name' => 'Taylor', 'last_name' => 'Employee']);
        EmployeeReportingRelationship::create([
            'employee_id' => $employee->id,
            'manager_employee_id' => $manager->id,
            'is_primary' => true,
            'effective_from' => now()->subMonth()->toDateString(),
        ]);
        $user = $this->createUserWithPermissions(['people.employee.self.view'], ['employee_id' => $employee->id]);

        $this->actingAs($user)->getJson('/api/v1/org-chart')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.employeeId', $employee->id)
            ->assertJsonMissing(['name' => 'Private Manager'])
            ->assertJsonMissing(['nationalId' => 'DO-NOT-EXPOSE']);

        $this->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonPath('employee.managerId', $manager->id)
            ->assertJsonPath('employee.manager', 'Private Manager')
            ->assertJsonMissing(['nationalId' => 'DO-NOT-EXPOSE']);
    }

    public function test_org_chart_uses_only_current_primary_reporting_relationships(): void
    {
        $user = $this->createUserWithPermissions(['people.employee.view.all', 'organigram.view']);
        $oldManager = Employee::factory()->create(['first_name' => 'Old', 'last_name' => 'Manager']);
        $currentManager = Employee::factory()->create(['first_name' => 'Current', 'last_name' => 'Manager']);
        $employee = Employee::factory()->create(['first_name' => 'Casey', 'last_name' => 'Report']);
        EmployeeReportingRelationship::create([
            'employee_id' => $employee->id,
            'manager_employee_id' => $oldManager->id,
            'is_primary' => true,
            'effective_from' => now()->subYear()->toDateString(),
            'effective_to' => now()->subDay()->toDateString(),
        ]);
        EmployeeReportingRelationship::create([
            'employee_id' => $employee->id,
            'manager_employee_id' => $currentManager->id,
            'is_primary' => true,
            'effective_from' => now()->toDateString(),
        ]);

        $this->actingAs($user)->getJson('/api/v1/org-chart?q=Casey')
            ->assertOk()
            ->assertJsonPath('data.0.employeeId', $employee->id);
        $this->getJson('/api/v1/org-chart?rootEmployeeId='.$currentManager->id)
            ->assertOk()
            ->assertJsonPath('data.0.children.0.employeeId', $employee->id);
        $this->getJson('/api/v1/org-chart?rootEmployeeId='.$oldManager->id)
            ->assertOk()
            ->assertJsonCount(0, 'data.0.children');
    }

    public function test_employee_summary_endpoint(): void
    {
        $employee = Employee::factory()->create(['email' => 'raw.fixture@example.test']);
        $user = $this->createUserWithPermissions(['people.employee.self.view']);
        $user->update([
            'email' => 'demo.employee.01@intelligence-rh.example.test',
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($user)->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonStructure([
                'employee',
                'leaveRequests',
                'leaveTypes',
                'leaveEntitlements',
                'onboardingCases',
                'holidays',
                'notifications',
                'unreadCount',
            ])
            ->assertJsonPath('employee.id', $employee->id)
            ->assertJsonPath('employee.email', 'demo.employee.01@intelligence-rh.example.test');
    }

    public function test_employee_resource_returns_user_email_or_falls_back_to_employee_email(): void
    {
        $employeeWithUser = Employee::factory()->create(['email' => 'raw.employee@example.test']);
        $viewer = $this->createUserWithPermissions(['people.employee.view.all']);
        $linkedUser = $this->createUserWithPermissions([]);
        $linkedUser->update(['email' => 'corporate.user@example.test', 'employee_id' => $employeeWithUser->id]);

        $employeeWithoutUser = Employee::factory()->create(['email' => 'unlinked.employee@example.test']);

        $this->actingAs($viewer)->getJson('/api/v1/employees/'.$employeeWithUser->id)
            ->assertOk()
            ->assertJsonPath('data.email', 'corporate.user@example.test');

        $this->actingAs($viewer)->getJson('/api/v1/employees/'.$employeeWithoutUser->id)
            ->assertOk()
            ->assertJsonPath('data.email', 'unlinked.employee@example.test');
    }
}
