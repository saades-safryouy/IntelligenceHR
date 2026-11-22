<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeReportingRelationship;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use Database\Seeders\LeaveWorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class ManagerPortalApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    public function test_manager_portal_endpoints_access_and_scoping(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);

        $department = Department::create(['code' => 'ENG', 'name' => 'Engineering']);
        $otherDept = Department::create(['code' => 'MKT', 'name' => 'Marketing']);

        $manager = Employee::factory()->create(['department_id' => $department->id]);
        $subordinate = Employee::factory()->create(['department_id' => $department->id]);
        $otherEmployee = Employee::factory()->create(['department_id' => $otherDept->id]);

        $managerUser = $this->createUserWithPermissions([
            'people.employee.view.department',
            'people.catalog.view',
            'organigram.view',
            'workflow.instance.view',
            'workflow.approve',
            'workflow.history.view',
            'notification.view',
        ], ['employee_id' => $manager->id]);

        \Illuminate\Support\Facades\DB::table('role_scope_assignments')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $managerUser->id,
            'role_id' => null,
            'scope_kind' => 'department',
            'scope_id' => (string) $department->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Assign reporting relationship
        EmployeeReportingRelationship::create([
            'employee_id' => $subordinate->id,
            'manager_employee_id' => $manager->id,
            'is_primary' => true,
            'effective_from' => now()->subMonths(6)->toDateString(),
        ]);

        // 1. Employee scoping: Manager can see subordinate, cannot see other dept employee
        $this->actingAs($managerUser)->getJson('/api/v1/employees/'.$subordinate->id)
            ->assertOk()
            ->assertJsonPath('data.id', $subordinate->id);

        $this->actingAs($managerUser)->getJson('/api/v1/employees/'.$otherEmployee->id)
            ->assertNotFound();

        // 2. Leave scoping: Manager can see subordinate leave, cannot see other dept leave
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'color' => '#10b981',
            'paid' => true,
            'is_active' => true,
        ]);
        $subLeave = LeaveRequest::create([
            'employee_id' => $subordinate->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-03',
            'from_half' => 'full',
            'to_half' => 'full',
            'duration' => 3,
            'status' => 'pending',
            'submitted_at' => now(),
        ]);
        $otherLeave = LeaveRequest::create([
            'employee_id' => $otherEmployee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-12-05',
            'end_date' => '2026-12-07',
            'from_half' => 'full',
            'to_half' => 'full',
            'duration' => 3,
            'status' => 'pending',
            'submitted_at' => now(),
        ]);

        $leaveList = $this->actingAs($managerUser)->getJson('/api/v1/leave-requests');
        $leaveList->assertOk()
            ->assertJsonFragment(['id' => $subLeave->id])
            ->assertJsonMissing(['id' => $otherLeave->id]);

        // 3. Holidays: Manager can view holidays (read-only)
        Holiday::create([
            'name' => 'Independence Day',
            'date' => '2026-11-18',
            'days' => 1,
            'recurring' => true,
            'type' => 'Public',
        ]);
        $this->actingAs($managerUser)->getJson('/api/v1/holidays')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Independence Day']);

        // Manager cannot create holidays
        $this->actingAs($managerUser)->postJson('/api/v1/holidays', [
            'name' => 'Unauthorized Holiday',
            'date' => '2026-12-25',
        ])->assertForbidden();

        // 4. Onboarding scoping: Manager can see subordinate onboarding, cannot see other
        $subOnboarding = OnboardingCase::create([
            'employee_id' => $subordinate->id,
            'employee_name' => 'Subordinate New Hire',
            'position' => 'Developer',
            'department' => 'Engineering',
            'start_date' => '2026-12-01',
            'status' => 'On track',
        ]);
        $otherOnboarding = OnboardingCase::create([
            'employee_id' => $otherEmployee->id,
            'employee_name' => 'Other New Hire',
            'position' => 'Marketer',
            'department' => 'Marketing',
            'start_date' => '2026-12-01',
            'status' => 'On track',
        ]);

        $onboardingList = $this->actingAs($managerUser)->getJson('/api/v1/onboarding-cases');
        $onboardingList->assertOk()
            ->assertJsonFragment(['id' => $subOnboarding->id])
            ->assertJsonMissing(['id' => $otherOnboarding->id]);

        // 5. Offboarding scoping: Manager can see subordinate offboarding, cannot see other
        $subOffboarding = OffboardingCase::create([
            'employee_id' => $subordinate->id,
            'employee_name' => 'Subordinate Departing',
            'exit_date' => '2026-12-31',
            'reason' => 'Resignation',
            'status' => 'On track',
        ]);
        $otherOffboarding = OffboardingCase::create([
            'employee_id' => $otherEmployee->id,
            'employee_name' => 'Other Departing',
            'exit_date' => '2026-12-31',
            'reason' => 'Resignation',
            'status' => 'On track',
        ]);

        $offboardingList = $this->actingAs($managerUser)->getJson('/api/v1/offboarding-cases');
        $offboardingList->assertOk()
            ->assertJsonFragment(['id' => $subOffboarding->id])
            ->assertJsonMissing(['id' => $otherOffboarding->id]);

        // 6. Security & RBAC: Manager cannot access HR admin endpoints
        $this->actingAs($managerUser)->getJson('/api/v1/roles')->assertForbidden();
        $this->actingAs($managerUser)->getJson('/api/v1/permissions')->assertForbidden();
        $this->actingAs($managerUser)->getJson('/api/v1/workflow-templates')->assertForbidden();
        $this->actingAs($managerUser)->getJson('/api/v1/audit-logs')->assertForbidden();
        $this->actingAs($managerUser)->getJson('/api/v1/audit-logs')->assertForbidden();
    }
}