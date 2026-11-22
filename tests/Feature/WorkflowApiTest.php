<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Employee;
use App\Models\EmployeeReportingRelationship;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\User;
use App\Models\WorkflowInstance;
use App\Models\WorkflowTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class WorkflowApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    public function test_business_requests_start_workflows_and_sync_terminal_outcomes(): void
    {
        $initiator = $this->createUserWithPermissions([
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'people.employee.create',
            'people.employee.update',
            'people.employee.view.all',
        ]);
        $approver = $this->createUserWithPermissions(['workflow.approve']);
        $this->createPublishedWorkflow($initiator, $approver, 'leave', 'leave_request');
        $this->createPublishedWorkflow($initiator, $approver, 'onboarding', 'onboarding_case');
        $this->createPublishedWorkflow($initiator, $approver, 'offboarding', 'offboarding_case');

        $employee = Employee::factory()->create();
        $leaveType = LeaveType::create(['code' => 'annual', 'name_key' => 'annual']);
        $leave = $this->actingAs($initiator)->postJson('/api/v1/leave-requests', [
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-02',
            'duration' => 2,
        ])->assertCreated()->json('data');
        $this->assertSame('pending_approval', WorkflowInstance::where('resource_id', $leave['id'])->firstOrFail()->status);

        $onboardingEmployee = Employee::factory()->create();
        $onboarding = $this->postJson('/api/v1/onboarding-cases', [
            'employee_id' => $onboardingEmployee->id,
            'employee_name' => 'New colleague',
            'position' => 'Analyst',
            'department' => 'People',
            'start_date' => '2026-12-10',
        ])->assertCreated()->json('data');
        $this->assertSame('pending_approval', $onboarding['approval_status']);

        $offboardingEmployee = Employee::factory()->create();
        $offboarding = $this->postJson('/api/v1/offboarding-cases', [
            'employee_id' => $offboardingEmployee->id,
            'employee_name' => 'Departing colleague',
            'exit_date' => '2026-12-20',
            'reason' => 'Resignation',
        ])->assertCreated()->json('data');
        $this->assertSame('pending_approval', $offboarding['approval_status']);

        $leaveInstance = WorkflowInstance::where('resource_id', $leave['id'])->firstOrFail();
        $this->actingAs($approver)->getJson('/api/v1/workflow-instances/'.$leaveInstance->id.'/resource')
            ->assertOk()
            ->assertJsonPath('data.id', $leave['id'])
            ->assertJsonMissingPath('data.employee.national_id');
        $leaveAssignment = $leaveInstance->steps()->firstOrFail()->assignments()->firstOrFail();
        $returnAction = [
            'assignmentId' => $leaveAssignment->id,
            'action' => 'return',
            'comment' => 'Please correct the dates.',
            'idempotencyKey' => 'return-leave-request',
        ];
        $this->actingAs($approver)->postJson('/api/v1/workflow-instances/'.$leaveInstance->id.'/actions', $returnAction)
            ->assertOk()->assertJsonPath('data.status', 'returned_for_correction');
        $this->postJson('/api/v1/workflow-instances/'.$leaveInstance->id.'/actions', $returnAction)
            ->assertOk()->assertJsonPath('data.status', 'returned_for_correction');
        $this->assertDatabaseCount('approval_actions', 1);
        $this->assertSame('pending', LeaveRequest::findOrFail($leave['id'])->status);

        $onboardingInstance = WorkflowInstance::where('resource_id', $onboarding['id'])->firstOrFail();
        $this->getJson('/api/v1/workflow-instances/'.$onboardingInstance->id.'/resource')
            ->assertOk()
            ->assertJsonPath('data.employee_name', 'New colleague');
        $onboardingAssignment = $onboardingInstance->steps()->firstOrFail()->assignments()->firstOrFail();
        $this->postJson('/api/v1/workflow-instances/'.$onboardingInstance->id.'/actions', [
            'assignmentId' => $onboardingAssignment->id,
            'action' => 'approve',
            'idempotencyKey' => 'approve-onboarding-case',
        ])->assertOk();
        $this->assertSame('approved', OnboardingCase::findOrFail($onboarding['id'])->approval_status);
        $this->assertSame('On track', OnboardingCase::findOrFail($onboarding['id'])->status);

        $offboardingInstance = WorkflowInstance::where('resource_id', $offboarding['id'])->firstOrFail();
        $this->getJson('/api/v1/workflow-instances/'.$offboardingInstance->id.'/resource')
            ->assertOk()
            ->assertJsonPath('data.employee_name', 'Departing colleague');
        $offboardingAssignment = $offboardingInstance->steps()->firstOrFail()->assignments()->firstOrFail();
        $this->postJson('/api/v1/workflow-instances/'.$offboardingInstance->id.'/actions', [
            'assignmentId' => $offboardingAssignment->id,
            'action' => 'reject',
            'idempotencyKey' => 'reject-offboarding-case',
        ])->assertOk();
        $this->assertSame('rejected', OffboardingCase::findOrFail($offboarding['id'])->approval_status);
        $this->assertSame('On track', OffboardingCase::findOrFail($offboarding['id'])->status);

        $viewer = $this->createUserWithPermissions(['workflow.instance.view']);
        $this->actingAs($viewer)->getJson('/api/v1/workflow-instances/'.$leaveInstance->id.'/resource')
            ->assertNotFound();
    }

    public function test_delegated_approver_can_decide_only_during_delegation_window(): void
    {
        $initiator = $this->createUserWithPermissions([
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.instance.start',
        ]);
        $approver = $this->createUserWithPermissions(['workflow.approve', 'workflow.delegate']);
        $delegate = $this->createUserWithPermissions(['workflow.approve']);
        $template = $this->actingAs($initiator)->postJson('/api/v1/workflow-templates', [
            'key' => 'delegated-review',
            'module' => 'documents',
            'resourceType' => 'document',
            'name' => 'Delegated review',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [[
                'key' => 'review',
                'sequence' => 1,
                'groupKey' => 'review',
                'mode' => 'sequential',
                'completionRule' => 'all',
                'approverRule' => ['type' => 'user', 'userIds' => [$approver->id]],
            ]],
        ])->assertCreated()->json('data');
        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')->assertOk();
        $instance = $this->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version['id'],
            'resourceType' => 'document',
            'resourceId' => 'DOC-DELEGATED',
            'idempotencyKey' => 'start-doc-delegated',
        ])->assertCreated()->json('data');
        $assignmentId = $instance['steps'][0]['assignments'][0]['id'];
        $startsAt = now()->addSeconds(1);
        $endsAt = now()->addHour();
        $delegation = $this->actingAs($approver)->postJson('/api/v1/workflow-delegations', [
            'assignmentId' => $assignmentId,
            'delegateUserId' => $delegate->id,
            'startsAt' => $startsAt->toISOString(),
            'endsAt' => $endsAt->toISOString(),
        ])->assertCreated()->json('data');
        $this->actingAs($delegate)->getJson('/api/v1/workflow-delegations')
            ->assertOk()
            ->assertJsonPath('data.0.id', $delegation['id']);
        $this->travel(2)->seconds();
        $this->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
            'assignmentId' => $assignmentId,
            'action' => 'approve',
            'idempotencyKey' => 'delegated-approve',
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->actingAs($approver)->deleteJson('/api/v1/workflow-delegations/'.$delegation['id'])
            ->assertOk()
            ->assertJsonPath('data.revoked_at', fn ($value) => $value !== null);
    }

    public function test_approval_inbox_can_filter_by_module_and_submission_date(): void
    {
        $initiator = $this->createUserWithPermissions([
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.instance.start',
        ]);
        $approver = $this->createUserWithPermissions(['workflow.approve']);
        $this->createPublishedWorkflow($initiator, $approver, 'leave', 'leave_request');
        $version = WorkflowTemplate::query()
            ->where('module', 'leave')
            ->firstOrFail()
            ->versions()
            ->firstOrFail();

        $current = $this->actingAs($initiator)->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version->id,
            'resourceType' => 'leave_request',
            'resourceId' => 'LEAVE-CURRENT',
            'idempotencyKey' => 'leave-current',
        ])->assertCreated()->json('data');
        $older = $this->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version->id,
            'resourceType' => 'leave_request',
            'resourceId' => 'LEAVE-OLDER',
            'idempotencyKey' => 'leave-older',
        ])->assertCreated()->json('data');

        WorkflowInstance::query()->whereKey($current['id'])->update(['submitted_at' => '2026-03-10 12:00:00']);
        WorkflowInstance::query()->whereKey($older['id'])->update(['submitted_at' => '2026-02-10 12:00:00']);

        $this->actingAs($approver)->getJson('/api/v1/workflow-instances?assignedToMe=1&module=leave&submittedFrom=2026-03-01&submittedTo=2026-03-31')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $current['id']);

        $this->getJson('/api/v1/workflow-instances?module=offboarding')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/v1/workflow-instances?submittedFrom=2026-03-31&submittedTo=2026-03-01')
            ->assertUnprocessable();
    }

    public function test_team_workflows_are_limited_to_visible_current_primary_reporting_descendants(): void
    {
        $managerEmployee = Employee::factory()->create();
        $reportEmployee = Employee::factory()->create();
        $outsiderEmployee = Employee::factory()->create();
        $manager = $this->createUserWithPermissions([
            'people.employee.view.all',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.instance.view',
            'workflow.history.view',
        ], ['employee_id' => $managerEmployee->id]);
        $approver = $this->createUserWithPermissions(['workflow.approve']);
        $report = $this->createUserWithPermissions(['workflow.instance.start'], ['employee_id' => $reportEmployee->id]);
        $outsider = $this->createUserWithPermissions(['workflow.instance.start'], ['employee_id' => $outsiderEmployee->id]);

        EmployeeReportingRelationship::create([
            'employee_id' => $reportEmployee->id,
            'manager_employee_id' => $managerEmployee->id,
            'is_primary' => true,
            'effective_from' => now()->subDay()->toDateString(),
        ]);
        EmployeeReportingRelationship::create([
            'employee_id' => $outsiderEmployee->id,
            'manager_employee_id' => $managerEmployee->id,
            'is_primary' => false,
            'effective_from' => now()->subDay()->toDateString(),
        ]);

        $this->createPublishedWorkflow($manager, $approver, 'leave', 'leave_request');
        $version = WorkflowTemplate::query()
            ->where('module', 'leave')
            ->firstOrFail()
            ->versions()
            ->firstOrFail();
        $reportWorkflow = $this->actingAs($report)->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version->id,
            'resourceType' => 'leave_request',
            'resourceId' => 'REPORT-REQUEST',
            'idempotencyKey' => 'report-request',
        ])->assertCreated()->json('data');
        $outsiderWorkflow = $this->actingAs($outsider)->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version->id,
            'resourceType' => 'leave_request',
            'resourceId' => 'OUTSIDER-REQUEST',
            'idempotencyKey' => 'outsider-request',
        ])->assertCreated()->json('data');

        $this->actingAs($manager)->getJson('/api/v1/workflow-instances?team=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $reportWorkflow['id']);
        $this->getJson('/api/v1/workflow-instances/'.$reportWorkflow['id'])->assertOk();
        $this->getJson('/api/v1/workflow-instances/'.$outsiderWorkflow['id'])->assertNotFound();
        $this->getJson('/api/v1/workflow-instances/'.$reportWorkflow['id'].'/history')->assertOk();
    }

    private function createPublishedWorkflow(User $initiator, User $approver, string $module, string $resourceType): void
    {
        $template = $this->actingAs($initiator)->postJson('/api/v1/workflow-templates', [
            'key' => $module.'-approval',
            'module' => $module,
            'resourceType' => $resourceType,
            'name' => ucfirst($module).' approval',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [[
                'key' => 'review',
                'sequence' => 1,
                'groupKey' => 'review',
                'mode' => 'sequential',
                'completionRule' => 'all',
                'approverRule' => ['type' => 'user', 'userIds' => [$approver->id]],
            ]],
        ])->assertCreated()->json('data');
        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')->assertOk();
    }

    public function test_two_sequential_steps_are_resolved_and_approved_with_history(): void
    {
        $initiator = $this->createUserWithPermissions(['workflow.template.create', 'workflow.template.update', 'workflow.template.publish', 'workflow.instance.start', 'workflow.instance.view', 'workflow.history.view']);
        $firstApprover = $this->createUserWithPermissions(['workflow.approve']);
        $secondApprover = $this->createUserWithPermissions(['workflow.approve']);

        $template = $this->actingAs($initiator)->postJson('/api/v1/workflow-templates', [
            'key' => 'leave-review',
            'module' => 'leave',
            'resourceType' => 'leave_request',
            'name' => 'Leave review',
        ])->assertCreated()->json('data');

        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [
                [
                    'key' => 'manager',
                    'sequence' => 1,
                    'groupKey' => 'manager',
                    'mode' => 'sequential',
                    'completionRule' => 'all',
                    'approverRule' => ['type' => 'user', 'userIds' => [$firstApprover->id]],
                ],
                [
                    'key' => 'hr',
                    'sequence' => 2,
                    'groupKey' => 'hr',
                    'mode' => 'sequential',
                    'completionRule' => 'all',
                    'approverRule' => ['type' => 'user', 'userIds' => [$secondApprover->id]],
                ],
            ],
        ])->assertCreated()->json('data');

        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')
            ->assertOk()
            ->assertJsonPath('data.status', 'published');

        $instance = $this->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version['id'],
            'resourceType' => 'leave_request',
            'resourceId' => 'LV-100',
            'idempotencyKey' => 'start-leave-100',
        ])->assertCreated()->json('data');

        $firstAssignment = $instance['steps'][0]['assignments'][0]['id'];
        $this->actingAs($secondApprover)->getJson('/api/v1/workflow-instances?assignedToMe=1&status=pending_approval')
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->actingAs($firstApprover)->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
            'assignmentId' => $firstAssignment,
            'action' => 'approve',
            'idempotencyKey' => 'decision-one',
        ])->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $this->actingAs($secondApprover)->getJson('/api/v1/workflow-instances?assignedToMe=1&status=pending_approval')
            ->assertOk()
            ->assertJsonPath('data.0.steps.1.status', 'active');
        $instance = $this->actingAs($initiator)->getJson('/api/v1/workflow-instances/'.$instance['id'])
            ->assertOk()->json('data');
        $this->assertSame('active', $instance['steps'][1]['status']);
        $secondAssignment = $instance['steps'][1]['assignments'][0]['id'];

        $this->actingAs($secondApprover)->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
            'assignmentId' => $secondAssignment,
            'action' => 'approve',
            'idempotencyKey' => 'decision-two',
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->actingAs($initiator)->getJson('/api/v1/workflow-instances/'.$instance['id'].'/history')
            ->assertOk()
            ->assertJsonPath('total', 3);
    }

    public function test_parallel_quorum_is_explicit_and_unassigned_actor_cannot_decide(): void
    {
        $initiator = $this->createUserWithPermissions(['workflow.template.create', 'workflow.template.update', 'workflow.template.publish', 'workflow.instance.start']);
        $approvers = [
            $this->createUserWithPermissions(['workflow.approve']),
            $this->createUserWithPermissions(['workflow.approve']),
        ];

        $template = $this->actingAs($initiator)->postJson('/api/v1/workflow-templates', [
            'key' => 'parallel-review',
            'module' => 'documents',
            'resourceType' => 'document',
            'name' => 'Parallel review',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [[
                'key' => 'reviewers',
                'sequence' => 1,
                'groupKey' => 'reviewers',
                'mode' => 'parallel',
                'completionRule' => 'quorum',
                'quorum' => 2,
                'approverRule' => ['type' => 'user', 'userIds' => array_map(fn (User $user) => $user->id, $approvers)],
            ]],
        ])->assertCreated()->json('data');
        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')->assertOk();
        $instance = $this->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version['id'],
            'resourceType' => 'document',
            'resourceId' => 'DOC-9',
            'idempotencyKey' => 'start-doc-9',
        ])->assertCreated()->json('data');

        $assignment = $instance['steps'][0]['assignments'][0]['id'];
        $outsider = User::factory()->create();
        $this->actingAs($outsider)->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
            'assignmentId' => $assignment,
            'action' => 'approve',
            'idempotencyKey' => 'outsider-attempt',
        ])->assertForbidden();

        foreach ($approvers as $index => $approver) {
            $this->actingAs($approver)->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
                'assignmentId' => $instance['steps'][0]['assignments'][$index]['id'],
                'action' => 'approve',
                'idempotencyKey' => 'parallel-'.$index,
            ])->assertOk()->assertJsonPath('data.status', $index === 0 ? 'pending_approval' : 'approved');
        }
    }

    public function test_next_sequence_waits_until_all_steps_in_current_sequence_are_approved(): void
    {
        $initiator = $this->createUserWithPermissions(['workflow.template.create', 'workflow.template.update', 'workflow.template.publish', 'workflow.instance.start']);
        $approvers = [
            $this->createUserWithPermissions(['workflow.approve']),
            $this->createUserWithPermissions(['workflow.approve']),
            $this->createUserWithPermissions(['workflow.approve']),
        ];
        $template = $this->actingAs($initiator)->postJson('/api/v1/workflow-templates', [
            'key' => 'parallel-stages',
            'module' => 'documents',
            'resourceType' => 'document',
            'name' => 'Parallel stages',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [
                [
                    'key' => 'review-a',
                    'sequence' => 1,
                    'groupKey' => 'reviews',
                    'mode' => 'parallel',
                    'completionRule' => 'all',
                    'approverRule' => ['type' => 'user', 'userIds' => [$approvers[0]->id]],
                ],
                [
                    'key' => 'review-b',
                    'sequence' => 1,
                    'groupKey' => 'reviews',
                    'mode' => 'parallel',
                    'completionRule' => 'all',
                    'approverRule' => ['type' => 'user', 'userIds' => [$approvers[1]->id]],
                ],
                [
                    'key' => 'final-approval',
                    'sequence' => 2,
                    'groupKey' => 'final',
                    'mode' => 'sequential',
                    'completionRule' => 'all',
                    'approverRule' => ['type' => 'user', 'userIds' => [$approvers[2]->id]],
                ],
            ],
        ])->assertCreated()->json('data');
        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')->assertOk();
        $instance = $this->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version['id'],
            'resourceType' => 'document',
            'resourceId' => 'DOC-PARALLEL-STAGES',
            'idempotencyKey' => 'start-parallel-stages',
        ])->assertCreated()->json('data');

        foreach ([0, 1] as $index) {
            $this->actingAs($approvers[$index])->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
                'assignmentId' => $instance['steps'][$index]['assignments'][0]['id'],
                'action' => 'approve',
                'idempotencyKey' => 'stage-one-'.$index,
            ])->assertOk()->assertJsonPath('data.steps.2.status', $index === 0 ? 'queued' : 'active');
        }
    }

    public function test_workflow_creation_requires_explicit_approval_and_completion_rules(): void
    {
        $user = $this->createUserWithPermissions(['workflow.template.create', 'workflow.template.update']);
        $template = $this->actingAs($user)->postJson('/api/v1/workflow-templates', [
            'key' => 'incomplete',
            'module' => 'leave',
            'resourceType' => 'leave_request',
            'name' => 'Incomplete workflow',
        ])->assertCreated()->json('data');

        $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [['key' => 'approval', 'sequence' => 1, 'groupKey' => 'approval', 'mode' => 'sequential']],
        ])->assertUnprocessable();
    }

    public function test_employee_workflow_visibility_is_limited_and_comments_require_history_permission(): void
    {
        $owner = $this->createUserWithPermissions([
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.instance.start',
            'workflow.instance.view',
        ]);
        $approver = $this->createUserWithPermissions(['workflow.approve']);
        $template = $this->actingAs($owner)->postJson('/api/v1/workflow-templates', [
            'key' => 'employee-private-request',
            'module' => 'leave',
            'resourceType' => 'leave_request',
            'name' => 'Employee private request',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [[
                'key' => 'manager-review',
                'sequence' => 1,
                'groupKey' => 'manager',
                'mode' => 'sequential',
                'completionRule' => 'all',
                'approverRule' => ['type' => 'user', 'userIds' => [$approver->id]],
            ]],
        ])->assertCreated()->json('data');
        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')->assertOk();
        $instance = $this->postJson('/api/v1/workflow-instances', [
            'templateVersionId' => $version['id'],
            'resourceType' => 'leave_request',
            'resourceId' => 'EMPLOYEE-PRIVATE-REQUEST',
            'idempotencyKey' => 'employee-private-request',
        ])->assertCreated()->json('data');

        $outsider = $this->createUserWithPermissions(['workflow.instance.view']);
        $this->actingAs($outsider)->getJson('/api/v1/workflow-instances?mine=1')
            ->assertOk()
            ->assertJsonPath('total', 0);
        $this->getJson('/api/v1/workflow-instances/'.$instance['id'])->assertNotFound();

        $this->actingAs($owner)->getJson('/api/v1/workflow-instances/'.$instance['id'])
            ->assertOk()
            ->assertJsonMissingPath('data.actions')
            ->assertJsonMissingPath('data.steps.0.assignments.0.approver')
            ->assertJsonMissingPath('data.steps.0.assignments.0.approver_user_id');

        $this->actingAs($approver)->postJson('/api/v1/workflow-instances/'.$instance['id'].'/actions', [
            'assignmentId' => $instance['steps'][0]['assignments'][0]['id'],
            'action' => 'approve',
            'idempotencyKey' => 'employee-private-request-approved',
        ])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $owner->id,
            'type' => 'workflow.updated',
            'resource_type' => 'workflow_instance',
            'resource_id' => $instance['id'],
        ]);
    }
}
