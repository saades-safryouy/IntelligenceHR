<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\EmployeeReportingRelationship;
use App\Models\Holiday;
use App\Models\LeaveEntitlement;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkflowInstance;
use Database\Seeders\LeaveWorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class HrDomainApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    public function test_leave_requests_lifecycle(): void
    {
        $department = Department::create(['code' => 'HR', 'name' => 'Human Resources']);
        $employee = Employee::factory()->create(['department_id' => $department->id]);
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'color' => '#10b981',
            'paid' => true,
            'is_active' => true,
        ]);

        $user = $this->createUserWithPermissions([
            'people.employee.view',
            'people.employee.self.view',
            'people.employee.update',
            'people.employee.self.update',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.approve',
        ], ['employee_id' => $employee->id]);
        $this->publishWorkflow($user, 'leave', 'leave_request');

        // 1. Create a leave request
        $createResponse = $this->actingAs($user)->postJson('/api/v1/leave-requests', [
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-01',
            'end_date' => '2026-11-05',
            'from_half' => 'full',
            'to_half' => 'full',
            'duration' => 5,
            'note' => 'Annual vacation',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.duration', 4)
            ->assertJsonPath('data.status', 'pending');

        $requestId = $createResponse->json('data.id');

        // 2. Fetch the created leave request by ID
        $getResponse = $this->actingAs($user)->getJson("/api/v1/leave-requests/{$requestId}");
        $getResponse->assertOk()
            ->assertJsonPath('data.id', $requestId)
            ->assertJsonPath('data.note', 'Annual vacation');

        // 3. List leave requests
        $listResponse = $this->actingAs($user)->getJson('/api/v1/leave-requests?pageSize=10');
        $listResponse->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $requestId);

        // 4. Decisions must use the workflow engine rather than direct status mutation.
        $statusResponse = $this->actingAs($user)->patchJson("/api/v1/leave-requests/{$requestId}/status", [
            'status' => 'approved',
        ]);
        $statusResponse->assertStatus(409)
            ->assertJsonPath('message', 'Leave status changes must be made through a workflow decision.');
        $this->assertDatabaseHas('leave_requests', ['id' => $requestId, 'status' => 'pending']);

        // 5. Delete (cancel) leave request
        $deleteResponse = $this->actingAs($user)->deleteJson("/api/v1/leave-requests/{$requestId}");
        $deleteResponse->assertNoContent();

        $this->assertDatabaseMissing('leave_requests', ['id' => $requestId]);
    }

    public function test_employee_leave_request_creates_workflow_for_the_current_primary_manager(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);

        $employee = Employee::factory()->create();
        $manager = Employee::factory()->create();
        $employeeUser = $this->createUserWithPermissions([
            'people.employee.self.view',
            'people.employee.self.update',
        ], ['employee_id' => $employee->id]);
        $managerUser = $this->createUserWithPermissions(['workflow.approve'], ['employee_id' => $manager->id]);
        EmployeeReportingRelationship::create([
            'employee_id' => $employee->id,
            'manager_employee_id' => $manager->id,
            'is_primary' => true,
            'effective_from' => now()->subYear()->toDateString(),
        ]);
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'color' => '#10b981',
            'paid' => true,
            'is_active' => true,
        ]);

        $response = $this->actingAs($employeeUser)->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-30',
            'end_date' => '2026-12-01',
            'from_half' => 'full',
            'to_half' => 'full',
            'note' => 'Annual vacation',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.employee_id', $employee->id)
            ->assertJsonPath('data.duration', 2)
            ->assertJsonPath('data.status', 'pending');

        $requestId = $response->json('data.id');
        $this->assertDatabaseHas('leave_requests', [
            'id' => $requestId,
            'employee_id' => $employee->id,
            'status' => 'pending',
        ]);

        $workflow = WorkflowInstance::query()->where('resource_id', $requestId)->firstOrFail();
        $this->assertSame('pending_approval', $workflow->status);
        $assignment = $workflow->steps()->firstOrFail()->assignments()->firstOrFail();
        $this->assertSame($managerUser->id, $assignment->approver_user_id);
        $this->assertSame('manager_chain', $assignment->source_type);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $managerUser->id,
            'type' => 'workflow.approval_required',
            'resource_type' => 'workflow_instance',
            'resource_id' => $workflow->id,
        ]);

        $this->actingAs($employeeUser)->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonPath('leaveRequests.0.id', $requestId)
            ->assertJsonPath('leaveRequests.0.status', 'pending');
    }

    public function test_invalid_employee_leave_requests_return_field_errors_without_persisting(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $employee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.self.update',
        ], ['employee_id' => $employee->id]);
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'is_active' => true,
        ]);

        $invalidDates = $this->actingAs($user)->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-12-02',
            'end_date' => '2026-12-01',
        ]);
        $invalidDates->assertStatus(422)->assertJsonValidationErrors(['end_date']);

        LeaveEntitlement::create([
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'entitlement' => 0.5,
            'year' => 2026,
        ]);
        $exceedsBalance = $this->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-30',
            'end_date' => '2026-12-01',
        ]);
        $exceedsBalance->assertStatus(422)->assertJsonValidationErrors(['duration']);

        $this->assertDatabaseCount('leave_requests', 0);
        $this->assertDatabaseCount('workflow_instances', 0);
    }

    public function test_employee_leave_request_fails_closed_when_no_manager_is_resolvable(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $employee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.self.update',
        ], ['employee_id' => $employee->id]);
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'is_active' => true,
        ]);

        $this->actingAs($user)->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-30',
            'end_date' => '2026-12-01',
        ])->assertStatus(422)->assertJsonValidationErrors(['approverRule']);

        $this->assertDatabaseCount('leave_requests', 0);
        $this->assertDatabaseCount('workflow_instances', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_employee_without_self_update_permission_cannot_create_leave_requests(): void
    {
        $employee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.self.view',
        ], ['employee_id' => $employee->id]);

        $this->actingAs($user)->postJson('/api/v1/leave-requests', [
            'leave_type_id' => '8d02f6b6-44f4-4d44-b3b2-c976fd927136',
            'start_date' => '2026-11-30',
            'end_date' => '2026-12-01',
        ])->assertForbidden();

        $this->assertDatabaseCount('leave_requests', 0);
    }

    public function test_leave_request_completes_through_the_employee_manager_workflow(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $actors = $this->createWorkflowActors();
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'color' => '#10b981',
            'paid' => true,
            'is_active' => true,
        ]);
        LeaveEntitlement::create([
            'employee_id' => $actors['employee']->id,
            'leave_type_id' => $leaveType->id,
            'entitlement' => 10,
            'year' => 2026,
        ]);

        $created = $this->actingAs($actors['employeeUser'])->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-30',
            'end_date' => '2026-11-30',
            'from_half' => 'PM',
            'to_half' => 'full',
            'note' => 'Medical appointment',
        ]);
        $created->assertCreated()
            ->assertJsonPath('data.employee_id', $actors['employee']->id)
            ->assertJsonPath('data.duration', 0.5)
            ->assertJsonPath('data.status', 'pending');

        $requestId = $created->json('data.id');
        $workflow = WorkflowInstance::query()->where('resource_id', $requestId)->firstOrFail();
        $assignment = $workflow->steps()->firstOrFail()->assignments()->firstOrFail();
        $this->assertSame($actors['managerUser']->id, $assignment->approver_user_id);
        $this->assertSame('pending_approval', $workflow->status);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['managerUser']->id,
            'type' => 'workflow.approval_required',
            'resource_id' => $workflow->id,
        ]);

        $this->actingAs($actors['outsiderUser'])
            ->getJson('/api/v1/workflow-instances/'.$workflow->id)
            ->assertNotFound();
        $this->actingAs($actors['managerUser'])
            ->getJson('/api/v1/workflow-instances?assignedToMe=1&status=pending_approval')
            ->assertOk()
            ->assertJsonPath('data.0.id', $workflow->id);

        $this->actingAs($actors['managerUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $assignment->id,
            'action' => 'approve',
            'comment' => 'Approved; coverage is arranged.',
            'idempotencyKey' => 'approve-e2e-leave',
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertSame('approved', LeaveRequest::findOrFail($requestId)->status);
        $this->assertDatabaseHas('approval_actions', [
            'workflow_instance_id' => $workflow->id,
            'actor_user_id' => $actors['managerUser']->id,
            'action' => 'approve',
            'comment' => 'Approved; coverage is arranged.',
        ]);
        $this->assertDatabaseHas('workflow_events', [
            'workflow_instance_id' => $workflow->id,
            'event_type' => 'approved',
            'to_status' => 'approved',
        ]);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['employeeUser']->id,
            'type' => 'workflow.updated',
            'resource_id' => $workflow->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $actors['managerUser']->id,
            'action' => 'workflow.decision.approve',
            'target_id' => $workflow->id,
        ]);

        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/workflow-instances?mine=1')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $workflow->id);
        $this->getJson('/api/v1/workflow-instances/'.$workflow->id)->assertOk();
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonPath('leaveRequests.0.status', 'approved');
        $this->actingAs($actors['outsiderUser'])->getJson('/api/v1/leave-requests/'.$requestId)
            ->assertNotFound();
        $this->actingAs($actors['hrUser'])->getJson('/api/v1/leave-requests?employeeId='.$actors['employee']->id)
            ->assertOk()
            ->assertJsonPath('data.0.status', 'approved');

        $this->actingAs($actors['outsiderUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $assignment->id,
            'action' => 'reject',
            'idempotencyKey' => 'unauthorized-e2e-leave',
        ])->assertForbidden();
    }
    public function test_leave_request_rejection_lifecycle(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $actors = $this->createWorkflowActors();
        $leaveType = LeaveType::create([
            'code' => 'annual_reject',
            'name_key' => 'annual_leave',
            'color' => '#ef4444',
            'paid' => true,
            'is_active' => true,
        ]);
        LeaveEntitlement::create([
            'employee_id' => $actors['employee']->id,
            'leave_type_id' => $leaveType->id,
            'entitlement' => 15,
            'year' => 2026,
        ]);

        $created = $this->actingAs($actors['employeeUser'])->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-12-20',
            'end_date' => '2026-12-22',
            'from_half' => 'full',
            'to_half' => 'full',
            'note' => 'Holiday vacation request',
        ]);
        $created->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $requestId = $created->json('data.id');
        $workflow = WorkflowInstance::query()->where('resource_id', $requestId)->firstOrFail();
        $assignment = $workflow->steps()->firstOrFail()->assignments()->firstOrFail();

        // Manager rejects the request
        $rejected = $this->actingAs($actors['managerUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $assignment->id,
            'action' => 'reject',
            'comment' => 'Coverage not available during this period.',
            'idempotencyKey' => 'reject-leave-e2e-'.Str::uuid(),
        ]);
        $rejected->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        // Verify leave request status is updated to rejected
        $leave = LeaveRequest::findOrFail($requestId);
        $this->assertSame('rejected', $leave->status);

        // Verify workflow instance status is rejected
        $this->assertSame('rejected', $workflow->fresh()->status);

        // Verify approval action is recorded
        $this->assertDatabaseHas('approval_actions', [
            'workflow_instance_id' => $workflow->id,
            'actor_user_id' => $actors['managerUser']->id,
            'action' => 'reject',
            'comment' => 'Coverage not available during this period.',
        ]);

        // Verify workflow event is recorded
        $this->assertDatabaseHas('workflow_events', [
            'workflow_instance_id' => $workflow->id,
            'event_type' => 'reject',
        ]);

        // Verify employee receives notification
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['employeeUser']->id,
            'type' => 'workflow.updated',
            'resource_id' => $workflow->id,
        ]);

        // Verify employee can see the rejected status in their leave requests
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/leave-requests')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $requestId,
                'status' => 'rejected',
            ]);
    }

    public function test_all_three_roles_access_restrictions_matrix(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $actors = $this->createWorkflowActors();

        // 1. EMPLOYEE RESTRICTIONS
        // Employee cannot create onboarding cases
        $this->actingAs($actors['employeeUser'])->postJson('/api/v1/onboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'Unauthorized Onboarding',
            'position' => 'Dev',
            'department' => 'IT',
            'start_date' => '2026-12-01',
        ])->assertForbidden();

        // Employee cannot create offboarding cases
        $this->actingAs($actors['employeeUser'])->postJson('/api/v1/offboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'Unauthorized Offboarding',
            'exit_date' => '2026-12-31',
            'reason' => 'Leaving',
        ])->assertForbidden();

        // Get the template version from seeded workflows
        $templateVersion = \App\Models\WorkflowTemplateVersion::firstOrFail();

        // Create a dummy workflow to test approval authorization
        $realWorkflow = WorkflowInstance::create([
            'workflow_template_version_id' => $templateVersion->id,
            'initiator_user_id' => $actors['hrUser']->id,
            'resource_type' => 'onboarding_case',
            'resource_id' => Str::uuid(),
            'status' => 'pending_approval',
            'idempotency_key' => 'idemp-'.Str::uuid(),
        ]);

        // Employee cannot approve any workflows
        $this->actingAs($actors['employeeUser'])->postJson('/api/v1/workflow-instances/'.$realWorkflow->id.'/actions', [
            'assignmentId' => Str::uuid(),
            'action' => 'approve',
        ])->assertForbidden();

        // Employee cannot view workflow templates (HR only)
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/workflow-templates')
            ->assertForbidden();

        // Employee cannot view audit logs
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/audit-logs')
            ->assertForbidden();

        // 2. MANAGER RESTRICTIONS
        // Manager cannot create onboarding cases
        $this->actingAs($actors['managerUser'])->postJson('/api/v1/onboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'Manager Cannot Onboard',
            'position' => 'Dev',
            'department' => 'IT',
            'start_date' => '2026-12-01',
        ])->assertForbidden();

        // Manager cannot create offboarding cases
        $this->actingAs($actors['managerUser'])->postJson('/api/v1/offboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'Manager Cannot Offboard',
            'exit_date' => '2026-12-31',
            'reason' => 'Leaving',
        ])->assertForbidden();

        // Manager cannot view another manager's employee cases
        $otherEmployee = Employee::factory()->create();
        $otherCase = OnboardingCase::create([
            'employee_id' => $otherEmployee->id,
            'employee_name' => 'Other Employee',
            'position' => 'Designer',
            'department' => 'Design',
            'start_date' => '2026-12-01',
            'status' => 'On track',
        ]);
        $this->actingAs($actors['managerUser'])->getJson('/api/v1/onboarding-cases/'.$otherCase->id)
            ->assertNotFound();

        // 3. HR RESTRICTIONS
        // HR can view all cases, but cannot approve steps assigned to a manager chain they are not in
        $leaveType = LeaveType::create([
            'code' => 'annual_matrix',
            'name_key' => 'annual_leave',
            'color' => '#10b981',
            'paid' => true,
            'is_active' => true,
        ]);
        LeaveEntitlement::create([
            'employee_id' => $actors['employee']->id,
            'leave_type_id' => $leaveType->id,
            'entitlement' => 10,
            'year' => 2026,
        ]);
        $leaveResp = $this->actingAs($actors['employeeUser'])->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-12-15',
            'end_date' => '2026-12-16',
            'from_half' => 'full',
            'to_half' => 'full',
        ]);
        $leaveResp->assertCreated();
        $leaveWf = WorkflowInstance::where('resource_id', $leaveResp->json('data.id'))->firstOrFail();
        $managerStepAssignment = $leaveWf->steps()->firstOrFail()->assignments()->firstOrFail();

        // HR user attempting to approve a manager-chain assignment they are not assigned to
        $this->actingAs($actors['hrUser'])->postJson('/api/v1/workflow-instances/'.$leaveWf->id.'/actions', [
            'assignmentId' => $managerStepAssignment->id,
            'action' => 'approve',
            'idempotencyKey' => 'hr-invalid-approval-'.Str::uuid(),
        ])->assertForbidden();
    }

    public function test_onboarding_completes_with_manager_and_hr_approval_and_employee_tasks(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $actors = $this->createWorkflowActors();

        $this->actingAs($actors['employeeUser'])->postJson('/api/v1/onboarding-cases', [
            'employee_name' => 'Unauthorized',
            'position' => 'Analyst',
            'department' => 'Engineering',
            'start_date' => '2026-12-01',
        ])->assertForbidden();
        $this->actingAs($actors['hrUser'])->postJson('/api/v1/onboarding-cases', [
            'employee_name' => 'Unlinked employee',
            'position' => 'Analyst',
            'department' => 'Engineering',
            'start_date' => '2026-12-01',
        ])->assertJsonValidationErrors(['employee_id']);
        $this->assertDatabaseCount('onboarding_cases', 0);
        $this->assertDatabaseCount('workflow_instances', 0);

        $created = $this->actingAs($actors['hrUser'])->postJson('/api/v1/onboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'E2E Employee',
            'position' => 'Product Analyst',
            'department' => 'Engineering',
            'start_date' => '2026-12-01',
            'assignee' => 'People Operations',
        ]);
        $created->assertCreated()
            ->assertJsonPath('data.employee_id', $actors['employee']->id)
            ->assertJsonPath('data.status', 'On track')
            ->assertJsonPath('data.approval_status', 'pending_approval');

        $caseId = $created->json('data.id');
        $visibleTask = OnboardingTask::create([
            'onboarding_case_id' => $caseId,
            'label_key' => 'taskWelcomePack',
            'done' => false,
            'due_date' => '2026-12-01',
            'employee_visible' => true,
        ]);
        $privateTask = OnboardingTask::create([
            'onboarding_case_id' => $caseId,
            'label_key' => 'private_hr_task',
            'done' => false,
            'due_date' => '2026-12-02',
            'employee_visible' => false,
        ]);

        $workflow = WorkflowInstance::query()->where('resource_id', $caseId)->firstOrFail();
        $managerAssignment = $workflow->steps()->where('sequence', 1)->firstOrFail()->assignments()->firstOrFail();
        $this->assertSame($actors['managerUser']->id, $managerAssignment->approver_user_id);
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $actors['hrUser']->id,
            'action' => 'onboarding.created',
            'target_id' => $caseId,
        ]);

        $this->actingAs($actors['managerUser'])->getJson('/api/v1/workflow-instances?team=1&status=pending_approval')
            ->assertOk()
            ->assertJsonFragment(['id' => $workflow->id]);
        $this->getJson('/api/v1/workflow-instances/'.$workflow->id.'/resource')
            ->assertOk()
            ->assertJsonPath('data.employee_name', 'E2E Employee')
            ->assertJsonPath('data.progress', 0);
        $this->getJson('/api/v1/onboarding-cases')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.tasks')
            ->assertJsonMissing(['label_key' => 'private_hr_task']);

        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/workflow-instances?mine=1')
            ->assertOk()
            ->assertJsonPath('data.0.id', $workflow->id);
        $this->getJson('/api/v1/workflow-instances/'.$workflow->id)->assertOk();
        $this->getJson('/api/v1/workflow-instances/'.$workflow->id.'/history')->assertForbidden();
        $this->getJson('/api/v1/onboarding-cases')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.tasks')
            ->assertJsonMissing(['label_key' => 'private_hr_task']);
        $this->patchJson('/api/v1/onboarding-tasks/'.$privateTask->id, ['done' => true])->assertForbidden();
        $this->patchJson('/api/v1/onboarding-cases/'.$caseId, ['status' => 'Completed'])->assertForbidden();

        $this->actingAs($actors['managerUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $managerAssignment->id,
            'action' => 'approve',
            'comment' => 'Manager review complete.',
            'idempotencyKey' => 'approve-e2e-onboarding-manager',
        ])->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $hrAssignment = $workflow->steps()->where('sequence', 2)->firstOrFail()->assignments()->firstOrFail();
        $this->assertSame($actors['hrUser']->id, $hrAssignment->approver_user_id);
        $this->assertSame('pending', $hrAssignment->status);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['hrUser']->id,
            'type' => 'workflow.approval_required',
            'resource_id' => $workflow->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['employeeUser']->id,
            'type' => 'workflow.updated',
            'resource_id' => $workflow->id,
        ]);

        $this->actingAs($actors['employeeUser'])->patchJson('/api/v1/onboarding-tasks/'.$visibleTask->id, ['done' => true])
            ->assertOk()
            ->assertJsonPath('data.done', true);
        $this->assertSame(50, OnboardingCase::findOrFail($caseId)->progress);
        $this->actingAs($actors['managerUser'])->patchJson('/api/v1/onboarding-tasks/'.$privateTask->id, ['done' => true])
            ->assertForbidden();

        $this->actingAs($actors['hrUser'])->patchJson('/api/v1/onboarding-tasks/'.$privateTask->id, ['done' => true])
            ->assertOk();
        $this->assertSame(100, OnboardingCase::findOrFail($caseId)->progress);
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $actors['hrUser']->id,
            'action' => 'onboarding_task.updated',
            'target_id' => $privateTask->id,
        ]);

        $this->actingAs($actors['hrUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $hrAssignment->id,
            'action' => 'approve',
            'comment' => 'HR validation complete.',
            'idempotencyKey' => 'approve-e2e-onboarding-hr',
        ])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->patchJson('/api/v1/onboarding-cases/'.$caseId, ['status' => 'Completed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Completed');
        $this->postJson('/api/v1/onboarding-cases/'.$caseId.'/stage', ['stage' => 'Completed'])
            ->assertOk()
            ->assertJsonPath('data.stage', 'Completed');
        $this->assertSame('approved', OnboardingCase::findOrFail($caseId)->approval_status);
        $this->assertDatabaseHas('approval_actions', [
            'workflow_instance_id' => $workflow->id,
            'actor_user_id' => $actors['hrUser']->id,
            'comment' => 'HR validation complete.',
        ]);
        $this->assertDatabaseHas('workflow_events', [
            'workflow_instance_id' => $workflow->id,
            'event_type' => 'approved',
        ]);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['employeeUser']->id,
            'type' => 'workflow.updated',
            'resource_id' => $workflow->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $actors['hrUser']->id,
            'action' => 'onboarding.updated',
            'target_id' => $caseId,
        ]);
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonPath('onboardingCases.0.status', 'Completed')
            ->assertJsonPath('onboardingCases.0.approval_status', 'approved')
            ->assertJsonPath('onboardingCases.0.tasks.0.done', true);
        $this->actingAs($actors['outsiderUser'])->getJson('/api/v1/onboarding-cases/'.$caseId)
            ->assertNotFound();
    }

    public function test_offboarding_completes_with_manager_and_hr_approval_and_scoped_access(): void
    {
        $this->seed(LeaveWorkflowSeeder::class);
        $actors = $this->createWorkflowActors();

        $this->actingAs($actors['managerUser'])->postJson('/api/v1/offboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'Unauthorized',
            'exit_date' => '2026-12-31',
            'reason' => 'Resignation',
        ])->assertForbidden();
        $this->actingAs($actors['hrUser'])->postJson('/api/v1/offboarding-cases', [
            'employee_name' => 'Unlinked employee',
            'exit_date' => '2026-12-31',
            'reason' => 'Resignation',
        ])->assertJsonValidationErrors(['employee_id']);
        $this->assertDatabaseCount('offboarding_cases', 0);
        $this->assertDatabaseCount('workflow_instances', 0);

        $created = $this->actingAs($actors['hrUser'])->postJson('/api/v1/offboarding-cases', [
            'employee_id' => $actors['employee']->id,
            'employee_name' => 'E2E Employee',
            'exit_date' => '2026-12-31',
            'reason' => 'Resignation',
            'replacement' => 'Hiring',
        ]);
        $created->assertCreated()
            ->assertJsonPath('data.employee_id', $actors['employee']->id)
            ->assertJsonPath('data.approval_status', 'pending_approval');

        $caseId = $created->json('data.id');
        $workflow = WorkflowInstance::query()->where('resource_id', $caseId)->firstOrFail();
        $managerAssignment = $workflow->steps()->where('sequence', 1)->firstOrFail()->assignments()->firstOrFail();
        $this->assertSame($actors['managerUser']->id, $managerAssignment->approver_user_id);

        $this->actingAs($actors['managerUser'])->getJson('/api/v1/workflow-instances?team=1&status=pending_approval')
            ->assertOk()
            ->assertJsonFragment(['id' => $workflow->id]);
        $this->getJson('/api/v1/workflow-instances/'.$workflow->id.'/resource')
            ->assertOk()
            ->assertJsonPath('data.employee_name', 'E2E Employee');
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/workflow-instances?mine=1')
            ->assertOk()
            ->assertJsonPath('data.0.id', $workflow->id);
        $this->getJson('/api/v1/offboarding-cases/'.$caseId)
            ->assertOk()
            ->assertJsonPath('data.employee_id', $actors['employee']->id);
        $this->patchJson('/api/v1/offboarding-cases/'.$caseId, ['status' => 'Completed'])
            ->assertForbidden();
        $this->actingAs($actors['outsiderUser'])->getJson('/api/v1/offboarding-cases/'.$caseId)
            ->assertNotFound();

        $this->actingAs($actors['managerUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $managerAssignment->id,
            'action' => 'approve',
            'comment' => 'Exit plan reviewed.',
            'idempotencyKey' => 'approve-e2e-offboarding-manager',
        ])->assertOk()->assertJsonPath('data.status', 'pending_approval');
        $hrAssignment = $workflow->steps()->where('sequence', 2)->firstOrFail()->assignments()->firstOrFail();
        $this->assertSame($actors['hrUser']->id, $hrAssignment->approver_user_id);
        $this->actingAs($actors['hrUser'])->postJson('/api/v1/workflow-instances/'.$workflow->id.'/actions', [
            'assignmentId' => $hrAssignment->id,
            'action' => 'approve',
            'comment' => 'HR clearance complete.',
            'idempotencyKey' => 'approve-e2e-offboarding-hr',
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/notifications?unread=1&pageSize=10')
            ->assertOk()
            ->assertJsonFragment(['type' => 'workflow.updated']);

        $this->actingAs($actors['hrUser'])->patchJson('/api/v1/offboarding-cases/'.$caseId, [
            'status' => 'Completed',
            'progress' => 40,
            'stage' => 'Closed',
        ])->assertOk()
            ->assertJsonPath('data.status', 'Completed')
            ->assertJsonPath('data.progress', 100);
        $case = OffboardingCase::findOrFail($caseId);
        $this->assertSame('approved', $case->approval_status);
        $this->assertSame(100, $case->progress);
        $this->assertDatabaseHas('workflow_events', [
            'workflow_instance_id' => $workflow->id,
            'event_type' => 'approved',
        ]);
        $this->assertDatabaseHas('approval_actions', [
            'workflow_instance_id' => $workflow->id,
            'actor_user_id' => $actors['hrUser']->id,
            'comment' => 'HR clearance complete.',
        ]);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $actors['employeeUser']->id,
            'type' => 'workflow.updated',
            'resource_id' => $workflow->id,
        ]);
        $this->actingAs($actors['hrUser'])->patchJson('/api/v1/offboarding-cases/'.$caseId, [
            'status' => 'unexpected',
        ])->assertJsonValidationErrors(['status']);
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $actors['hrUser']->id,
            'action' => 'offboarding.updated',
            'target_id' => $caseId,
        ]);
        $this->actingAs($actors['employeeUser'])->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonPath('offboardingCases.0.status', 'Completed')
            ->assertJsonPath('offboardingCases.0.approval_status', 'approved');
    }

    public function test_holidays_listing_and_creation(): void
    {
        $user = $this->createUserWithPermissions([
            'people.employee.view',
            'people.employee.self.view',
            'people.catalog.manage',
        ]);

        $postResponse = $this->actingAs($user)->postJson('/api/v1/holidays', [
            'name' => 'Independence Day',
            'name_key' => 'independence_day',
            'date' => '2026-11-18',
            'days' => 1,
            'recurring' => true,
            'type' => 'Public',
            'country' => 'MA',
        ]);

        $postResponse->assertCreated()
            ->assertJsonPath('data.name', 'Independence Day');

        $listResponse = $this->actingAs($user)->getJson('/api/v1/holidays?year=2026');
        $listResponse->assertOk()
            ->assertJsonPath('data.0.name', 'Independence Day');

        Holiday::create([
            'name' => 'Year-end holiday',
            'date' => '2020-12-31',
            'days' => 2,
            'recurring' => true,
            'type' => 'Public',
            'country' => 'MA',
        ]);
        Holiday::create([
            'name' => 'Other country holiday',
            'date' => '2027-01-02',
            'recurring' => false,
            'type' => 'Public',
            'country' => 'FR',
        ]);
        $this->actingAs($user)->getJson('/api/v1/holidays?year=2027&country=MA')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Year-end holiday'])
            ->assertJsonMissing(['name' => 'Other country holiday']);
    }

    public function test_onboarding_cases_and_task_lifecycle(): void
    {
        $employee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.view',
            'people.employee.self.view',
            'people.employee.create',
            'people.employee.update',
            'people.employee.self.update',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.approve',
        ], ['employee_id' => $employee->id]);
        $this->publishWorkflow($user, 'onboarding', 'onboarding_case');

        $createResponse = $this->actingAs($user)->postJson('/api/v1/onboarding-cases', [
            'employee_id' => $employee->id,
            'employee_name' => 'Jane Doe',
            'position' => 'Senior Developer',
            'department' => 'Engineering',
            'start_date' => '2026-12-01',
            'assignee' => 'HR Specialist',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.employee_name', 'Jane Doe')
            ->assertJsonPath('data.stage', 'HR Validation');

        $caseId = $createResponse->json('data.id');

        $listResponse = $this->actingAs($user)->getJson('/api/v1/onboarding-cases');
        $listResponse->assertOk()
            ->assertJsonPath('data.0.id', $caseId);
    }

    public function test_offboarding_cases_lifecycle(): void
    {
        $employee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.view',
            'people.employee.self.view',
            'people.employee.create',
            'people.employee.update',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.approve',
        ], ['employee_id' => $employee->id]);
        $this->publishWorkflow($user, 'offboarding', 'offboarding_case');

        $createResponse = $this->actingAs($user)->postJson('/api/v1/offboarding-cases', [
            'employee_id' => $employee->id,
            'employee_name' => 'John Smith',
            'exit_date' => '2026-12-31',
            'reason' => 'Career Growth',
            'replacement' => 'Hiring',
            'stage' => 'Exit Interview',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.employee_name', 'John Smith')
            ->assertJsonPath('data.status', 'On track');

        $listResponse = $this->actingAs($user)->getJson('/api/v1/offboarding-cases');
        $listResponse->assertOk()
            ->assertJsonPath('data.0.employee_name', 'John Smith');
    }

    public function test_employee_leave_request_uses_the_linked_employee_and_server_duration(): void
    {
        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();
        $leaveType = LeaveType::create([
            'code' => 'annual',
            'name_key' => 'annual_leave',
            'color' => '#10b981',
            'paid' => true,
            'is_active' => true,
        ]);
        $user = $this->createUserWithPermissions([
            'people.employee.self.update',
            'people.employee.self.view',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.approve',
        ], ['employee_id' => $employee->id]);
        $this->publishWorkflow($user, 'leave', 'leave_request');

        $this->actingAs($user)->postJson('/api/v1/leave-requests', [
            'employee_id' => $otherEmployee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-02',
            'end_date' => '2026-11-02',
            'duration' => 80,
        ])->assertForbidden();

        $response = $this->actingAs($user)->postJson('/api/v1/leave-requests', [
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-02',
            'end_date' => '2026-11-02',
            'duration' => 80,
        ]);
        $response->assertCreated()
            ->assertJsonPath('data.employee_id', $employee->id)
            ->assertJsonPath('data.duration', 1);
        $this->assertDatabaseMissing('leave_requests', ['employee_id' => $otherEmployee->id]);
    }

    public function test_employee_summary_and_documents_are_limited_to_the_linked_employee(): void
    {
        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.self.view',
        ], ['employee_id' => $employee->id]);
        $ownDocument = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'name' => 'Passport',
            'type' => 'Identity',
            'uploaded_at' => '2026-11-01',
            'status' => 'valid',
            'file_path' => 'private/passport.pdf',
        ]);
        $otherDocument = EmployeeDocument::create([
            'employee_id' => $otherEmployee->id,
            'name' => 'Contract',
            'type' => 'Employment',
            'uploaded_at' => '2026-11-01',
            'status' => 'valid',
        ]);

        $this->actingAs($user)->getJson('/api/v1/employees/summary')
            ->assertOk()
            ->assertJsonPath('employee.id', $employee->id)
            ->assertJsonPath('documents.0.id', $ownDocument->id)
            ->assertJsonPath('documents.0.has_file', true)
            ->assertJsonMissing(['file_path' => 'private/passport.pdf']);

        $this->actingAs($user)->getJson('/api/v1/employee-documents')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownDocument->id)
            ->assertJsonPath('data.0.has_file', true)
            ->assertJsonMissing(['file_path' => 'private/passport.pdf']);

        $this->actingAs($user)->getJson("/api/v1/employee-documents/{$otherDocument->id}")
            ->assertNotFound();
    }

    public function test_employee_summary_requires_a_linked_employee_record(): void
    {
        $user = $this->createUserWithPermissions(['people.employee.self.view']);

        $this->actingAs($user)->getJson('/api/v1/employees/summary')
            ->assertNotFound()
            ->assertJsonPath('message', 'Employee profile not found');
    }

    public function test_employee_can_update_only_their_own_profile_fields(): void
    {
        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.self.view',
            'people.employee.self.update',
        ], ['employee_id' => $employee->id]);
        $profile = [
            'personal_phone' => '+212600000001',
            'professional_phone' => '+212600000002',
            'marital_status' => 'Single',
            'number_of_children' => 0,
            'emergency_contact_name' => 'Sam Doe',
            'emergency_contact_phone' => '+212600000003',
            'emergency_contact_relationship' => 'Sibling',
        ];

        $this->actingAs($user)->patchJson("/api/v1/employees/{$employee->id}", $profile)
            ->assertOk()
            ->assertJsonPath('data.personalPhone', '+212600000001')
            ->assertJsonPath('data.numberOfChildren', 0);
        $this->assertNotNull($employee->fresh()->personal_info_completed_at);

        $this->actingAs($user)->patchJson("/api/v1/employees/{$otherEmployee->id}", [
            'personal_phone' => '+212600000099',
        ])->assertNotFound();
        $this->assertNotSame('+212600000099', $otherEmployee->fresh()->personal_phone);
    }

    public function test_employee_onboarding_response_hides_non_visible_tasks(): void
    {
        $employee = Employee::factory()->create();
        $user = $this->createUserWithPermissions([
            'people.employee.self.view',
            'people.employee.self.update',
        ], ['employee_id' => $employee->id]);
        $case = OnboardingCase::create([
            'employee_id' => $employee->id,
            'employee_name' => 'Jane Doe',
            'position' => 'Engineer',
            'department' => 'Engineering',
            'start_date' => '2026-12-01',
        ]);
        $visibleTask = OnboardingTask::create([
            'onboarding_case_id' => $case->id,
            'label_key' => 'taskWelcomePack',
            'done' => false,
            'employee_visible' => true,
        ]);
        OnboardingTask::create([
            'onboarding_case_id' => $case->id,
            'label_key' => 'private_hr_task',
            'done' => false,
            'employee_visible' => false,
        ]);

        $this->actingAs($user)->getJson('/api/v1/onboarding-cases')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.tasks')
            ->assertJsonPath('data.0.tasks.0.id', $visibleTask->id);

        $this->actingAs($user)->patchJson("/api/v1/onboarding-tasks/{$visibleTask->id}", ['done' => true])
            ->assertOk()
            ->assertJsonCount(1, 'data.onboarding_case.tasks')
            ->assertJsonPath('data.onboarding_case.tasks.0.id', $visibleTask->id)
            ->assertJsonMissing(['label_key' => 'private_hr_task']);
    }

    private function createWorkflowActors(): array
    {
        $department = Department::create(['code' => 'E2E', 'name' => 'E2E Department']);
        $manager = Employee::factory()->create(['department_id' => $department->id]);
        $employee = Employee::factory()->create(['department_id' => $department->id]);
        $outsiderEmployee = Employee::factory()->create();

        $managerUser = $this->createUserWithPermissions([
            'people.employee.view.department',
            'workflow.instance.view',
            'workflow.approve',
            'workflow.history.view',
            'notification.view',
        ], ['employee_id' => $manager->id]);
        $employeeUser = $this->createUserWithPermissions([
            'people.employee.self.view',
            'people.employee.self.update',
            'workflow.instance.view',
            'notification.view',
        ], ['employee_id' => $employee->id]);
        $outsiderUser = $this->createUserWithPermissions([
            'people.employee.self.view',
            'workflow.instance.view',
        ], ['employee_id' => $outsiderEmployee->id]);
        $hrUser = $this->createUserWithPermissions([
            'people.employee.view.all',
            'people.employee.create',
            'people.employee.update',
            'workflow.instance.view.all',
            'workflow.approve',
            'workflow.history.view',
            'notification.view',
        ]);

        EmployeeReportingRelationship::create([
            'employee_id' => $employee->id,
            'manager_employee_id' => $manager->id,
            'is_primary' => true,
            'effective_from' => now()->subYear()->toDateString(),
        ]);
        DB::table('role_scope_assignments')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $managerUser->id,
            'scope_kind' => 'department',
            'scope_id' => (string) $department->id,
            'valid_from' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $hrRole = Role::firstOrCreate(
            ['key' => 'hr-admin'],
            ['name' => 'HR Administrator', 'is_active' => true],
        );
        $approvalPermission = Permission::query()->where('key', 'workflow.approve')->firstOrFail();
        $hrRole->permissions()->syncWithoutDetaching([$approvalPermission->id]);
        $hrUser->roles()->attach($hrRole->id, ['valid_from' => now()]);

        return [
            'department' => $department,
            'manager' => $manager,
            'employee' => $employee,
            'managerUser' => $managerUser,
            'employeeUser' => $employeeUser,
            'outsiderUser' => $outsiderUser,
            'hrUser' => $hrUser,
        ];
    }

    private function publishWorkflow(User $user, string $module, string $resourceType): void
    {
        $template = $this->actingAs($user)->postJson('/api/v1/workflow-templates', [
            'key' => $module.'-lifecycle-test',
            'module' => $module,
            'resourceType' => $resourceType,
            'name' => ucfirst($module).' lifecycle test',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [[
                'key' => 'review',
                'sequence' => 1,
                'groupKey' => 'review',
                'mode' => 'sequential',
                'completionRule' => 'all',
                'approverRule' => ['type' => 'user', 'userIds' => [$user->id]],
            ]],
        ])->assertCreated()->json('data');
        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')->assertOk();
    }
}
