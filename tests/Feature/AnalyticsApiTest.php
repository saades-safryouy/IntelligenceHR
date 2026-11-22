<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeReportingRelationship;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class AnalyticsApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    public function test_hr_analytics_aggregate_actual_records_and_limitations(): void
    {
        $department = Department::create(['code' => 'ENG', 'name' => 'Engineering']);
        $employee = Employee::factory()->create(['department_id' => $department->id, 'status' => 'Active', 'joined_at' => '2026-02-01']);
        $hr = $this->createUserWithPermissions(['people.employee.view.all'], ['employee_id' => $employee->id]);
        $leaveType = LeaveType::create(['code' => 'annual', 'name_key' => 'annual', 'color' => '#10b981', 'paid' => true, 'is_active' => true]);
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'start_date' => '2026-03-10', 'end_date' => '2026-03-11', 'from_half' => 'full', 'to_half' => 'full', 'duration' => 2, 'status' => 'approved', 'submitted_at' => '2026-03-01 10:00:00']);
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'start_date' => '2026-04-10', 'end_date' => '2026-04-10', 'from_half' => 'full', 'to_half' => 'full', 'duration' => 1, 'status' => 'pending', 'submitted_at' => '2026-04-01 10:00:00']);

        $response = $this->actingAs($hr)->getJson('/api/v1/analytics/overview?from=2026-01-01&to=2026-03-31');
        $response->assertOk()
            ->assertJsonPath('period.from', '2026-01-01')
            ->assertJsonPath('workforce.headcount', 1)
            ->assertJsonPath('workforce.active', 1)
            ->assertJsonPath('workforce.newHires', 1)
            ->assertJsonPath('leave.byStatus.approved', 1)
            ->assertJsonPath('leave.approvedDays', 2)
            ->assertJsonPath('leave.byStatus.pending', null)
            ->assertJsonPath('workforce.departures', null);

        $this->assertSame('Employee termination dates are not stored.', $response->json('limitations.departures'));
    }

    public function test_manager_analytics_are_limited_to_authorized_department_records(): void
    {
        $department = Department::create(['code' => 'ENG', 'name' => 'Engineering']);
        $other = Department::create(['code' => 'MKT', 'name' => 'Marketing']);
        $managerEmployee = Employee::factory()->create(['department_id' => $department->id]);
        $visible = Employee::factory()->create(['department_id' => $department->id, 'status' => 'Active']);
        $hidden = Employee::factory()->create(['department_id' => $other->id, 'status' => 'Active']);
        $manager = $this->createUserWithPermissions(['people.employee.view.department'], ['employee_id' => $managerEmployee->id]);
        DB::table('role_scope_assignments')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => $manager->id, 'role_id' => null, 'scope_kind' => 'department', 'scope_id' => $department->id, 'created_at' => now(), 'updated_at' => now()]);

        $response = $this->actingAs($manager)->getJson('/api/v1/analytics/overview');
        $response->assertOk()->assertJsonPath('workforce.headcount', 2);
        $this->assertStringNotContainsString((string) $hidden->id, $response->getContent());
        $this->assertStringContainsString((string) $visible->id, $response->getContent());
    }
}
