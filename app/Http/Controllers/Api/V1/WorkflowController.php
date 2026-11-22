<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalAction;
use App\Models\ApprovalAssignment;
use App\Models\Delegation;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\LeaveRequest;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Models\WorkflowInstance;
use App\Models\WorkflowStep;
use App\Models\WorkflowTemplate;
use App\Models\WorkflowTemplateVersion;
use App\Services\AuditLogger;
use App\Services\EmployeeVisibility;
use App\Services\WorkflowEngine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkflowController extends Controller
{
    public function templates(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'module' => ['nullable', 'string', 'max:100'],
            'resourceType' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = WorkflowTemplate::query()
            ->with('versions')
            ->when($filters['module'] ?? null, fn (Builder $q, $module) => $q->where('module', $module))
            ->when($filters['resourceType'] ?? null, fn (Builder $q, $type) => $q->where('resource_type', $type))
            ->orderBy('name');
        $result = $query->paginate($filters['pageSize'] ?? 25)->appends($request->query());

        return $this->page($result);
    }

    public function createTemplate(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9][a-z0-9._-]*$/', 'unique:workflow_templates,key'],
            'module' => ['required', 'string', 'max:100'],
            'resourceType' => ['required', 'string', 'max:100'],
            'name' => ['required', 'string', 'max:150'],
        ]);
        $template = DB::transaction(function () use ($data, $request, $audit) {
            $template = WorkflowTemplate::create([
                'key' => $data['key'],
                'module' => $data['module'],
                'resource_type' => $data['resourceType'],
                'name' => $data['name'],
                'created_by' => $request->user()->id,
            ]);
            $audit->record($request->user(), 'workflow.template.created', $template);

            return $template;
        });

        return response()->json(['data' => $template], 201);
    }

    public function createVersion(Request $request, WorkflowTemplate $workflowTemplate, AuditLogger $audit): JsonResponse
    {
        abort_unless($workflowTemplate->is_active, 409, 'Inactive templates cannot be versioned.');
        $data = $request->validate([
            'steps' => ['required', 'array', 'min:1', 'max:100'],
            'steps.*.key' => ['required', 'string', 'max:100', 'distinct'],
            'steps.*.sequence' => ['required', 'integer', 'min:1'],
            'steps.*.groupKey' => ['required', 'string', 'max:100'],
            'steps.*.mode' => ['required', Rule::in(['sequential', 'parallel'])],
            'steps.*.completionRule' => ['required', Rule::in(['all', 'any', 'quorum'])],
            'steps.*.quorum' => ['required_if:steps.*.completionRule,quorum', 'nullable', 'integer', 'min:1'],
            'steps.*.approverRule' => ['required', 'array'],
            'steps.*.approverRule.type' => ['required', Rule::in(['user', 'role', 'manager_chain'])],
            'steps.*.approverRule.userIds' => ['required_if:steps.*.approverRule.type,user', 'array', 'min:1', 'max:50'],
            'steps.*.approverRule.userIds.*' => ['required', 'uuid', 'distinct', 'exists:users,id'],
            'steps.*.approverRule.roleKey' => ['required_if:steps.*.approverRule.type,role', 'nullable', 'string', 'exists:roles,key'],
            'steps.*.approverRule.levels' => ['required_if:steps.*.approverRule.type,manager_chain', 'nullable', 'integer', 'min:1', 'max:10'],
        ]);

        $sequenceModes = collect($data['steps'])->groupBy('sequence')->map(
            fn ($steps) => $steps->pluck('mode')->unique()->count(),
        );
        if ($sequenceModes->contains(fn ($modeCount) => $modeCount > 1)) {
            throw ValidationException::withMessages(['steps' => ['Steps in the same sequence must use a consistent mode.']]);
        }
        foreach ($data['steps'] as $index => $step) {
            if (($step['completionRule'] === 'quorum') !== isset($step['quorum'])) {
                throw ValidationException::withMessages(["steps.{$index}.quorum" => ['Quorum must be provided only for the quorum completion rule.']]);
            }
        }

        $version = DB::transaction(function () use ($workflowTemplate, $data, $request, $audit) {
            $number = ((int) $workflowTemplate->versions()->max('version_number')) + 1;
            $version = $workflowTemplate->versions()->create(['version_number' => $number, 'status' => 'draft']);
            foreach ($data['steps'] as $step) {
                $approverRule = $step['approverRule'];
                if (isset($approverRule['userIds'])) {
                    $approverRule['user_ids'] = $approverRule['userIds'];
                    unset($approverRule['userIds']);
                }
                if (isset($approverRule['roleKey'])) {
                    $approverRule['role_key'] = $approverRule['roleKey'];
                    unset($approverRule['roleKey']);
                }
                $version->steps()->create([
                    'key' => $step['key'],
                    'sequence' => $step['sequence'],
                    'group_key' => $step['groupKey'],
                    'mode' => $step['mode'],
                    'completion_rule' => $step['completionRule'],
                    'quorum' => $step['quorum'] ?? null,
                    'approver_rule' => $approverRule,
                ]);
            }
            $audit->record($request->user(), 'workflow.template_version.created', $version, changes: [
                'workflow_template_id' => $workflowTemplate->id,
                'version_number' => $number,
            ]);

            return $version->load('steps');
        });

        return response()->json(['data' => $version], 201);
    }

    public function publishVersion(Request $request, WorkflowTemplateVersion $workflowTemplateVersion, AuditLogger $audit): JsonResponse
    {
        abort_if($workflowTemplateVersion->status !== 'draft', 409, 'Only draft versions can be published.');
        abort_if($workflowTemplateVersion->steps()->count() === 0, 422, 'A workflow version must contain at least one step.');

        DB::transaction(function () use ($workflowTemplateVersion, $request, $audit) {
            $workflowTemplateVersion->update([
                'status' => 'published',
                'published_at' => now(),
                'published_by' => $request->user()->id,
            ]);
            $audit->record($request->user(), 'workflow.template_version.published', $workflowTemplateVersion);
        });

        return response()->json(['data' => $workflowTemplateVersion->refresh()->load('steps')]);
    }

    public function start(Request $request, AuditLogger $audit, WorkflowEngine $engine): JsonResponse
    {
        $data = $request->validate([
            'templateVersionId' => ['required', 'uuid', 'exists:workflow_template_versions,id'],
            'resourceType' => ['required', 'string', 'max:100'],
            'resourceId' => ['required', 'string', 'max:150'],
            'idempotencyKey' => ['required', 'string', 'max:150'],
        ]);

        $instance = $engine->start($request->user(), $data, $audit);

        return response()->json(['data' => $instance], 201);
    }

    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'mine' => ['nullable', 'boolean'],
            'assignedToMe' => ['nullable', 'boolean'],
            'team' => ['nullable', 'boolean'],
            'resourceType' => ['nullable', 'string', 'max:100'],
            'module' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['pending_approval', 'approved', 'rejected', 'returned_for_correction', 'cancelled'])],
            'submittedFrom' => ['nullable', 'date'],
            'submittedTo' => ['nullable', 'date', 'after_or_equal:submittedFrom'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = WorkflowInstance::query()->with([
            'version.template',
            'initiator:id,name',
            'steps' => fn (HasMany $steps) => $steps->orderBy('sequence'),
            'steps.assignments' => fn (HasMany $assignments) => $assignments->orderBy('sequence_order'),
        ])
            ->when(($filters['mine'] ?? false), function (Builder $q) use ($request, $visibility): void {
                $q->where(function (Builder $scope) use ($request, $visibility): void {
                    $scope->where('initiator_user_id', $request->user()->id);
                    $employeeId = $this->visibleEmployeeId($request->user(), $visibility);
                    if ($employeeId !== null) {
                        $this->orWhereResourceEmployee($scope, [$employeeId]);
                    }
                });
            })
            ->when(($filters['assignedToMe'] ?? false), fn (Builder $q) => $q->whereHas('steps', fn (Builder $step) => $step
                ->where('status', 'active')
                ->whereHas('assignments', fn (Builder $assignment) => $assignment
                    ->where('status', 'pending')
                    ->where(function (Builder $owner) use ($request) {
                        $owner->where('approver_user_id', $request->user()->id)
                            ->orWhereHas('delegations', fn (Builder $delegation) => $delegation
                                ->where('delegate_user_id', $request->user()->id)
                                ->whereNull('revoked_at')
                                ->where('starts_at', '<=', now())
                                ->where('ends_at', '>', now()));
                    }))))
            ->when($filters['resourceType'] ?? null, fn (Builder $q, $type) => $q->where('resource_type', $type))
            ->when($filters['module'] ?? null, fn (Builder $q, $module) => $q->whereHas(
                'version.template',
                fn (Builder $template) => $template->where('module', $module),
            ))
            ->when($filters['status'] ?? null, fn (Builder $q, $status) => $q->where('status', $status))
            ->when($filters['submittedFrom'] ?? null, fn (Builder $q, $date) => $q->whereDate('submitted_at', '>=', $date))
            ->when($filters['submittedTo'] ?? null, fn (Builder $q, $date) => $q->whereDate('submitted_at', '<=', $date))
            ->orderByDesc('created_at');

        if ($request->boolean('team')) {
            $teamUserIds = User::query()
                ->whereIn('employee_id', $visibility->reportingDescendantIds($request->user()))
                ->pluck('id');
            $query->where(function (Builder $scope) use ($teamUserIds, $request, $visibility): void {
                $scope->whereIn('initiator_user_id', $teamUserIds)
                    ->orWhere('initiator_user_id', $request->user()->id)
                    ->orWhereHas('steps.assignments', fn (Builder $assignment) => $assignment
                        ->where('approver_user_id', $request->user()->id)
                        ->orWhereHas('delegations', fn (Builder $delegation) => $delegation
                            ->where('delegate_user_id', $request->user()->id)));
                $this->orWhereResourceEmployee($scope, $visibility->reportingDescendantIds($request->user()));
            });
        } elseif (! $request->user()->hasPermission('workflow.instance.view.all')) {
            $query->where(function (Builder $scope) use ($request, $visibility): void {
                $scope->where('initiator_user_id', $request->user()->id)
                    ->orWhereHas('steps.assignments', fn (Builder $assignment) => $assignment
                        ->where('approver_user_id', $request->user()->id)
                        ->orWhereHas('delegations', fn (Builder $delegation) => $delegation
                            ->where('delegate_user_id', $request->user()->id)));
                $employeeId = $this->visibleEmployeeId($request->user(), $visibility);
                if ($employeeId !== null) {
                    $this->orWhereResourceEmployee($scope, [$employeeId]);
                }
            });
        }

        $result = $query->paginate($filters['pageSize'] ?? 25)->appends($request->query());
        if (! $request->user()->hasPermission('workflow.approve')
            && ! $request->user()->hasPermission('workflow.history.view')) {
            $result->getCollection()->each(function (WorkflowInstance $instance): void {
                foreach ($instance->steps as $step) {
                    foreach ($step->assignments as $assignment) {
                        $assignment->makeHidden(['approver_user_id', 'source_type', 'source_id']);
                    }
                }
            });
        }

        return $this->page($result);
    }

    public function show(
        Request $request,
        WorkflowInstance $workflowInstance,
        EmployeeVisibility $visibility,
        WorkflowEngine $engine,
    ): JsonResponse
    {
        abort_unless($this->canViewInstance($request->user(), $workflowInstance, $visibility, $engine), 404);

        return response()->json(['data' => $this->workflowDetails($request, $workflowInstance)]);
    }

    public function resource(
        Request $request,
        WorkflowInstance $workflowInstance,
        EmployeeVisibility $visibility,
        WorkflowEngine $engine,
    ): JsonResponse
    {
        abort_unless($this->canViewInstance($request->user(), $workflowInstance, $visibility, $engine), 404);

        $resource = match ($workflowInstance->resource_type) {
            'leave_request' => $this->leaveApprovalContext($workflowInstance->resource_id),
            'onboarding_case' => $this->onboardingApprovalContext($workflowInstance->resource_id),
            'offboarding_case' => $this->offboardingApprovalContext($workflowInstance->resource_id),
            default => abort(404),
        };

        return response()->json(['data' => $resource]);
    }

    public function decide(Request $request, WorkflowInstance $workflowInstance, AuditLogger $audit, WorkflowEngine $engine): JsonResponse
    {
        $data = $request->validate([
            'assignmentId' => ['required', 'uuid', 'exists:approval_assignments,id'],
            'action' => ['required', Rule::in(['approve', 'reject', 'return'])],
            'comment' => ['nullable', 'string', 'max:5000'],
            'idempotencyKey' => ['required', 'string', 'max:150'],
        ]);

        $instance = DB::transaction(function () use ($workflowInstance, $data, $request, $audit, $engine) {
            $instance = WorkflowInstance::query()->whereKey($workflowInstance->id)->lockForUpdate()->firstOrFail();
            $duplicate = ApprovalAction::query()
                ->where('actor_user_id', $request->user()->id)
                ->where('idempotency_key', $data['idempotencyKey'])
                ->first();
            if ($duplicate) {
                abort_if($duplicate->workflow_instance_id !== $instance->id, 409, 'The idempotency key was already used for another workflow.');
                return $instance->load('steps.assignments', 'actions');
            }

            abort_unless($instance->status === 'pending_approval', 409, 'This workflow is not awaiting a decision.');
            $assignment = ApprovalAssignment::query()
                ->whereKey($data['assignmentId'])
                ->whereHas('step', fn (Builder $q) => $q->where('workflow_instance_id', $instance->id))
                ->lockForUpdate()
                ->firstOrFail();
            $isAssignedApprover = $assignment->approver_user_id === $request->user()->id;
            $isActiveDelegate = $assignment->delegations()
                ->where('delegate_user_id', $request->user()->id)
                ->whereNull('revoked_at')
                ->where('starts_at', '<=', now())
                ->where('ends_at', '>', now())
                ->exists();
            abort_unless($isAssignedApprover || $isActiveDelegate, 403);
            abort_unless($assignment->status === 'pending', 409, 'This approval assignment is no longer pending.');

            $step = WorkflowStep::query()->whereKey($assignment->workflow_step_id)->lockForUpdate()->firstOrFail();
            abort_unless($step->status === 'active', 409, 'This approval step is not active.');
            abort_unless($request->user()->hasPermission('workflow.approve'), 403);

            $assignment->update([
                'status' => $data['action'] === 'approve' ? 'approved' : $data['action'],
                'resolved_at' => now(),
            ]);
            ApprovalAction::create([
                'workflow_instance_id' => $instance->id,
                'workflow_step_id' => $step->id,
                'assignment_id' => $assignment->id,
                'actor_user_id' => $request->user()->id,
                'action' => $data['action'],
                'comment' => $data['comment'] ?? null,
                'idempotency_key' => $data['idempotencyKey'],
                'occurred_at' => now(),
            ]);
            $this->notifyWorkflowUpdate($instance, $assignment, $request->user(), $engine);

            $oldStatus = $instance->status;
            if ($data['action'] === 'reject' || $data['action'] === 'return') {
                $instance->update([
                    'status' => $data['action'] === 'reject' ? 'rejected' : 'returned_for_correction',
                    'completed_at' => now(),
                ]);
                $step->update(['status' => $data['action'] === 'reject' ? 'rejected' : 'returned_for_correction', 'completed_at' => now()]);
                $instance->steps()
                    ->whereIn('status', ['active', 'queued'])
                    ->update(['status' => 'cancelled', 'completed_at' => now()]);
                ApprovalAssignment::query()
                    ->whereIn('workflow_step_id', $instance->steps()->select('id'))
                    ->whereIn('status', ['pending', 'queued'])
                    ->update(['status' => 'cancelled', 'resolved_at' => now()]);
                $engine->event($instance, $request->user()->id, $data['action'], $oldStatus, $instance->status, [
                    'stepId' => $step->id,
                    'comment' => $data['comment'] ?? null,
                ]);
            } elseif ($engine->stepSatisfied($step)) {
                $step->update(['status' => 'approved', 'completed_at' => now()]);
                $step->assignments()
                    ->whereIn('status', ['pending', 'queued'])
                    ->update(['status' => 'cancelled', 'resolved_at' => now()]);

                $sequenceStillActive = $instance->steps()
                    ->where('sequence', $step->sequence)
                    ->where('status', '!=', 'approved')
                    ->exists();
                if ($sequenceStillActive) {
                    $engine->event($instance, $request->user()->id, 'step_approved', $oldStatus, $oldStatus, ['stepId' => $step->id]);
                } else {
                    $nextSequence = $instance->steps()
                        ->where('sequence', '>', $step->sequence)
                        ->where('status', 'queued')
                        ->min('sequence');
                    if ($nextSequence === null) {
                        $instance->update(['status' => 'approved', 'completed_at' => now()]);
                        $engine->event($instance, $request->user()->id, 'approved', $oldStatus, 'approved', ['stepId' => $step->id]);
                    } else {
                        $engine->activateSequence($instance, (int) $nextSequence);
                        $engine->event($instance, $request->user()->id, 'step_approved', $oldStatus, $oldStatus, ['stepId' => $step->id]);
                    }
                }
            } else {
                if ($step->mode === 'sequential') {
                    $next = $step->assignments()
                        ->where('status', 'queued')
                        ->orderBy('sequence_order')
                        ->first();
                    if ($next) {
                        $next->update(['status' => 'pending', 'activated_at' => now()]);
                        $engine->notifyApprover($instance, $next);
                    }
                }
                $engine->event($instance, $request->user()->id, 'approval_recorded', $oldStatus, $oldStatus, ['stepId' => $step->id]);
            }
            $engine->syncResourceStatus($instance);

            $audit->record($request->user(), 'workflow.decision.'.$data['action'], $instance, changes: [
                'assignment_id' => $assignment->id,
                'step_id' => $step->id,
                'comment' => $data['comment'] ?? null,
            ]);

            return $instance->refresh()->load('steps.assignments', 'actions');
        });

        return response()->json(['data' => $this->workflowDetails($request, $instance)]);
    }

    public function delegations(Request $request): JsonResponse
    {
        $result = Delegation::query()
            ->where(fn (Builder $query) => $query
                ->where('delegator_user_id', $request->user()->id)
                ->orWhere('delegate_user_id', $request->user()->id))
            ->with([
                'delegator:id,name',
                'delegate:id,name',
                'assignment.step.instance:id,resource_type,resource_id,status',
            ])
            ->orderByDesc('starts_at')
            ->paginate($request->integer('pageSize', 25));

        return $this->page($result);
    }

    public function createDelegation(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'assignmentId' => ['required', 'uuid', 'exists:approval_assignments,id'],
            'delegateUserId' => ['required', 'uuid', 'exists:users,id'],
            'startsAt' => ['required', 'date', 'after_or_equal:now'],
            'endsAt' => ['required', 'date', 'after:startsAt'],
        ]);
        abort_if($data['delegateUserId'] === $request->user()->id, 422, 'You cannot delegate an approval to yourself.');

        $delegation = DB::transaction(function () use ($data, $request, $audit) {
            $assignment = ApprovalAssignment::query()
                ->with('step.instance')
                ->whereKey($data['assignmentId'])
                ->lockForUpdate()
                ->firstOrFail();
            abort_unless(
                $assignment->approver_user_id === $request->user()->id
                    && $assignment->status === 'pending'
                    && $assignment->step->status === 'active'
                    && $assignment->step->instance->status === 'pending_approval',
                409,
                'Only your active pending assignments can be delegated.',
            );

            $delegate = User::query()->whereKey($data['delegateUserId'])->where('is_active', true)->firstOrFail();
            abort_unless($delegate->hasPermission('workflow.approve'), 422, 'The selected user cannot approve workflows.');
            $overlap = Delegation::query()
                ->where('approval_assignment_id', $assignment->id)
                ->whereNull('revoked_at')
                ->where('starts_at', '<', $data['endsAt'])
                ->where('ends_at', '>', $data['startsAt'])
                ->exists();
            abort_if($overlap, 409, 'This approval assignment already has an overlapping delegation.');

            $delegation = Delegation::create([
                'delegator_user_id' => $request->user()->id,
                'delegate_user_id' => $delegate->id,
                'approval_assignment_id' => $assignment->id,
                'starts_at' => $data['startsAt'],
                'ends_at' => $data['endsAt'],
                'created_by' => $request->user()->id,
            ]);
            EmployeeNotification::firstOrCreate(
                ['deduplication_key' => 'workflow-delegation:'.$delegation->id],
                [
                    'recipient_user_id' => $delegate->id,
                    'type' => 'workflow.approval_delegated',
                    'title' => 'Approval delegated',
                    'body' => 'An approval assignment has been delegated to you.',
                    'resource_type' => 'workflow_instance',
                    'resource_id' => $assignment->step->instance->id,
                ],
            );
            $audit->record($request->user(), 'workflow.delegation.created', $delegation);

            return $delegation->load('delegator:id,name', 'delegate:id,name', 'assignment.step.instance');
        });

        return response()->json(['data' => $delegation], 201);
    }

    public function revokeDelegation(Request $request, Delegation $delegation, AuditLogger $audit): JsonResponse
    {
        abort_unless($delegation->delegator_user_id === $request->user()->id, 404);
        abort_if($delegation->revoked_at !== null, 409, 'This delegation has already been revoked.');

        DB::transaction(function () use ($delegation, $request, $audit) {
            $delegation->update(['revoked_at' => now()]);
            $audit->record($request->user(), 'workflow.delegation.revoked', $delegation);
        });

        return response()->json(['data' => $delegation->refresh()]);
    }

    public function history(
        Request $request,
        WorkflowInstance $workflowInstance,
        EmployeeVisibility $visibility,
        WorkflowEngine $engine,
    ): JsonResponse
    {
        abort_unless(
            $request->user()->hasPermission('workflow.history.view')
                && $this->canViewInstance($request->user(), $workflowInstance, $visibility, $engine),
            404,
        );
        $events = WorkflowEvent::query()
            ->where('workflow_instance_id', $workflowInstance->id)
            ->with('actor:id,name')
            ->orderBy('occurred_at')
            ->paginate($request->integer('pageSize', 25));

        return $this->page($events);
    }

    private function canViewAsReportingManager(
        User $user,
        WorkflowInstance $instance,
        EmployeeVisibility $visibility,
        WorkflowEngine $engine,
    ): bool
    {
        $employeeId = $engine->employeeIdForResource($instance)
            ?? User::query()->whereKey($instance->initiator_user_id)->value('employee_id');
        if (! $employeeId) {
            return false;
        }

        return in_array((int) $employeeId, $visibility->reportingDescendantIds($user), true);
    }

    private function canViewAsResourceEmployee(
        User $user,
        WorkflowInstance $instance,
        EmployeeVisibility $visibility,
        WorkflowEngine $engine,
    ): bool {
        $employeeId = $engine->employeeIdForResource($instance);
        $employee = $employeeId !== null ? Employee::query()->find($employeeId) : null;

        return $employee !== null
            && (int) $employee->id === (int) $user->employee_id
            && $visibility->canSee($user, $employee);
    }

    private function canViewInstance(
        User $user,
        WorkflowInstance $instance,
        EmployeeVisibility $visibility,
        WorkflowEngine $engine,
    ): bool
    {
        return $user->hasPermission('workflow.instance.view.all')
            || $instance->initiator_user_id === $user->id
            || $this->canViewAsResourceEmployee($user, $instance, $visibility, $engine)
            || $this->canViewAsReportingManager($user, $instance, $visibility, $engine)
            || $instance->steps()->whereHas('assignments', fn (Builder $q) => $q
                ->where('approver_user_id', $user->id)
                ->orWhereHas('delegations', fn (Builder $delegation) => $delegation
                    ->where('delegate_user_id', $user->id)))->exists();
    }

    private function orWhereResourceEmployee(Builder $query, array $employeeIds): void
    {
        if ($employeeIds === []) {
            return;
        }

        $query->orWhere(fn (Builder $resource) => $resource
            ->where('resource_type', 'leave_request')
            ->whereIn('resource_id', LeaveRequest::query()->select('id')->whereIn('employee_id', $employeeIds)))
            ->orWhere(fn (Builder $resource) => $resource
                ->where('resource_type', 'onboarding_case')
                ->whereIn('resource_id', OnboardingCase::query()->select('id')->whereIn('employee_id', $employeeIds)))
            ->orWhere(fn (Builder $resource) => $resource
                ->where('resource_type', 'offboarding_case')
                ->whereIn('resource_id', OffboardingCase::query()->select('id')->whereIn('employee_id', $employeeIds)));
    }

    private function visibleEmployeeId(User $user, EmployeeVisibility $visibility): ?int
    {
        if (! $user->employee_id) {
            return null;
        }
        $employee = Employee::query()->find($user->employee_id);

        return $employee && $visibility->canSee($user, $employee)
            ? (int) $employee->id
            : null;
    }

    private function notifyWorkflowUpdate(
        WorkflowInstance $instance,
        ApprovalAssignment $assignment,
        User $actor,
        WorkflowEngine $engine,
    ): void {
        $recipientIds = [$instance->initiator_user_id];
        $employeeId = $engine->employeeIdForResource($instance);
        if ($employeeId !== null) {
            $employeeUserId = User::query()->where('employee_id', $employeeId)->value('id');
            if ($employeeUserId !== null) {
                $recipientIds[] = $employeeUserId;
            }
        }

        foreach (array_unique($recipientIds) as $recipientId) {
            if ($recipientId === $actor->id) {
                continue;
            }
            $deduplicationKey = $recipientId === $instance->initiator_user_id
                ? 'workflow-update:'.$assignment->id
                : 'workflow-update:'.$assignment->id.':'.$recipientId;
            EmployeeNotification::firstOrCreate(
                ['deduplication_key' => $deduplicationKey],
                [
                    'recipient_user_id' => $recipientId,
                    'type' => 'workflow.updated',
                    'title' => 'Workflow updated',
                    'body' => 'A workflow approval step has been updated.',
                    'resource_type' => 'workflow_instance',
                    'resource_id' => $instance->id,
                ],
            );
        }
    }

    private function leaveApprovalContext(string $id): array
    {
        $leave = LeaveRequest::query()
            ->with([
                'employee.department:id,name',
                'employee.team:id,name',
                'leaveType:id,code,name_key',
                'backupEmployee:id,first_name,last_name',
            ])
            ->findOrFail($id);
        $employee = $leave->employee;

        return [
            'id' => (string) $leave->id,
            'employee' => $employee ? [
                'id' => $employee->id,
                'first_name' => $employee->first_name,
                'last_name' => $employee->last_name,
                'job_title' => $employee->job_title,
                'department' => $employee->department?->name,
                'team' => $employee->team?->name,
            ] : null,
            'employee_name' => $employee ? trim($employee->first_name.' '.$employee->last_name) : null,
            'leave_type_id' => $leave->leave_type_id,
            'leave_type' => $leave->leaveType ? [
                'id' => $leave->leaveType->id,
                'code' => $leave->leaveType->code,
                'name_key' => $leave->leaveType->name_key,
            ] : null,
            'start_date' => $leave->start_date?->toDateString(),
            'end_date' => $leave->end_date?->toDateString(),
            'from_half' => $leave->from_half,
            'to_half' => $leave->to_half,
            'duration' => $leave->duration,
            'backup_employee' => $leave->backupEmployee ? [
                'first_name' => $leave->backupEmployee->first_name,
                'last_name' => $leave->backupEmployee->last_name,
            ] : null,
            'note' => $leave->note,
            'status' => $leave->status,
        ];
    }

    private function onboardingApprovalContext(string $id): array
    {
        $case = OnboardingCase::query()->findOrFail($id);

        return [
            'id' => (string) $case->id,
            'employee_id' => $case->employee_id,
            'employee_name' => $case->employee_name,
            'position' => $case->position,
            'department' => $case->department,
            'start_date' => $case->start_date?->toDateString(),
            'stage' => $case->stage,
            'status' => $case->status,
            'approval_status' => $case->approval_status,
            'progress' => $case->progress,
        ];
    }

    private function offboardingApprovalContext(string $id): array
    {
        $case = OffboardingCase::query()->findOrFail($id);

        return [
            'id' => (string) $case->id,
            'employee_id' => $case->employee_id,
            'employee_name' => $case->employee_name,
            'exit_date' => $case->exit_date?->toDateString(),
            'reason' => $case->reason,
            'replacement' => $case->replacement,
            'stage' => $case->stage,
            'status' => $case->status,
            'approval_status' => $case->approval_status,
            'progress' => $case->progress,
        ];
    }

    private function page(\Illuminate\Contracts\Pagination\LengthAwarePaginator $result): JsonResponse
    {
        return response()->json([
            'data' => $result->items(),
            'page' => $result->currentPage(),
            'pageSize' => $result->perPage(),
            'total' => $result->total(),
        ]);
    }

    private function workflowDetails(Request $request, WorkflowInstance $instance): WorkflowInstance
    {
        $user = $request->user();
        $canSeeApprovers = $user->hasPermission('workflow.approve')
            || $user->hasPermission('workflow.history.view');
        $relations = ['version.template', 'initiator:id,name', 'steps.assignments'];
        if ($canSeeApprovers) {
            $relations[] = 'steps.assignments.approver:id,name';
        }
        if ($user->hasPermission('workflow.approve')) {
            $relations[] = 'steps.assignments.delegations.delegate:id,name';
        }

        $instance->load($relations);
        if (! $canSeeApprovers) {
            foreach ($instance->steps as $step) {
                foreach ($step->assignments as $assignment) {
                    $assignment->makeHidden(['approver_user_id', 'source_type', 'source_id']);
                }
            }
        }

        if ($user->hasPermission('workflow.history.view')) {
            $instance->load('actions.actor:id,name');
        } else {
            $instance->unsetRelation('actions');
        }

        return $instance;
    }
}
