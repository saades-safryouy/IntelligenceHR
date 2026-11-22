<?php

namespace App\Services;

use App\Models\ApprovalAssignment;
use App\Models\EmployeeDocument;
use App\Models\EmployeeNotification;
use App\Models\EmployeeReportingRelationship;
use App\Models\LeaveRequest;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkflowEvent;
use App\Models\WorkflowInstance;
use App\Models\WorkflowStep;
use App\Models\WorkflowTemplate;
use App\Models\WorkflowTemplateVersion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WorkflowEngine
{
    public function startForResource(
        User $initiator,
        string $module,
        string $resourceType,
        string $resourceId,
        AuditLogger $audit,
        ?string $idempotencyKey = null,
    ): WorkflowInstance {
        $templates = WorkflowTemplate::query()
            ->where('module', $module)
            ->where('resource_type', $resourceType)
            ->where('is_active', true)
            ->whereHas('versions', fn (Builder $query) => $query->where('status', 'published'))
            ->with(['versions' => fn ($query) => $query->where('status', 'published')->orderByDesc('version_number')])
            ->get();

        abort_if($templates->isEmpty(), 422, "No published workflow template is configured for {$resourceType}.");
        abort_if($templates->count() !== 1, 409, "More than one published workflow template is configured for {$resourceType}.");

        return $this->start($initiator, [
            'templateVersionId' => $templates->first()->versions->firstOrFail()->id,
            'resourceType' => $resourceType,
            'resourceId' => $resourceId,
            'idempotencyKey' => $idempotencyKey ?? 'resource:'.substr(hash('sha256', $resourceType.':'.$resourceId), 0, 64),
        ], $audit);
    }

    public function start(User $initiator, array $data, AuditLogger $audit): WorkflowInstance
    {
        return DB::transaction(function () use ($data, $initiator, $audit) {
            $version = WorkflowTemplateVersion::query()
                ->with('template', 'steps')
                ->whereKey($data['templateVersionId'])
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $version->status === 'published'
                    && $version->template->is_active
                    && $version->template->resource_type === $data['resourceType'],
                422,
                'The selected workflow version is not available for this resource type.',
            );

            $existing = WorkflowInstance::query()
                ->where('initiator_user_id', $initiator->id)
                ->where('resource_type', $data['resourceType'])
                ->where('resource_id', $data['resourceId'])
                ->where('idempotency_key', $data['idempotencyKey'])
                ->first();
            if ($existing) {
                return $existing->load('steps.assignments');
            }

            $instance = WorkflowInstance::create([
                'workflow_template_version_id' => $version->id,
                'initiator_user_id' => $initiator->id,
                'resource_type' => $data['resourceType'],
                'resource_id' => $data['resourceId'],
                'status' => 'pending_approval',
                'idempotency_key' => $data['idempotencyKey'],
                'submitted_at' => now(),
            ]);
            foreach ($version->steps->sortBy(['sequence', 'key']) as $templateStep) {
                $instance->steps()->create([
                    'workflow_template_step_id' => $templateStep->id,
                    'key' => $templateStep->key,
                    'sequence' => $templateStep->sequence,
                    'group_key' => $templateStep->group_key,
                    'mode' => $templateStep->mode,
                    'completion_rule' => $templateStep->completion_rule,
                    'quorum' => $templateStep->quorum,
                    'status' => 'queued',
                    'approver_rule' => $templateStep->approver_rule,
                ]);
            }

            $firstSequence = $instance->steps()->min('sequence');
            $this->activateSequence($instance, (int) $firstSequence);
            $this->event($instance, $initiator->id, 'submitted', null, 'pending_approval');
            $this->syncResourceStatus($instance);
            $audit->record($initiator, 'workflow.instance.started', $instance, changes: [
                'resource_type' => $instance->resource_type,
                'resource_id' => $instance->resource_id,
            ]);

            return $instance->load('steps.assignments');
        });
    }

    public function activateSequence(WorkflowInstance $instance, int $sequence): void
    {
        $steps = $instance->steps()->where('sequence', $sequence)->where('status', 'queued')->get();
        if ($steps->isEmpty()) {
            throw new \LogicException('The next workflow sequence contains no queued steps.');
        }

        foreach ($steps as $step) {
            $step->update(['status' => 'active', 'activated_at' => now()]);
            $approvers = $this->resolveApprovers($instance, $step->approver_rule);
            if ($approvers === []) {
                throw ValidationException::withMessages([
                    'approverRule' => ["Step {$step->key} resolved to no eligible approvers."],
                ]);
            }
            if ($step->completion_rule === 'quorum' && $step->quorum > count($approvers)) {
                throw ValidationException::withMessages([
                    'completionRule' => ["Step {$step->key} quorum exceeds the number of eligible approvers."],
                ]);
            }

            foreach ($approvers as $index => $approver) {
                $assignmentStatus = $step->mode === 'sequential' && $index > 0 ? 'queued' : 'pending';
                $assignment = $step->assignments()->create([
                    'approver_user_id' => $approver['user']->id,
                    'sequence_order' => $index + 1,
                    'source_type' => $approver['type'],
                    'source_id' => $approver['source'],
                    'status' => $assignmentStatus,
                    'activated_at' => $assignmentStatus === 'pending' ? now() : null,
                ]);
                if ($assignmentStatus === 'pending') {
                    $this->notifyApprover($instance, $assignment);
                }
            }
        }
    }

    public function stepSatisfied(WorkflowStep $step): bool
    {
        $approved = $step->assignments()->where('status', 'approved')->count();
        $total = $step->assignments()->count();

        return match ($step->completion_rule) {
            'all' => $total > 0 && $approved === $total,
            'any' => $approved >= 1,
            'quorum' => $step->quorum !== null && $approved >= $step->quorum,
            default => false,
        };
    }

    public function event(
        WorkflowInstance $instance,
        ?string $actorId,
        string $type,
        ?string $from,
        ?string $to,
        array $data = [],
    ): void {
        WorkflowEvent::create([
            'workflow_instance_id' => $instance->id,
            'actor_user_id' => $actorId,
            'event_type' => $type,
            'from_status' => $from,
            'to_status' => $to,
            'data' => $data,
            'correlation_id' => Str::uuid(),
            'occurred_at' => now(),
        ]);
    }

    public function syncResourceStatus(WorkflowInstance $instance): void
    {
        if ($instance->resource_type === 'leave_request') {
            $status = match ($instance->status) {
                'approved' => 'approved',
                'rejected' => 'rejected',
                'returned_for_correction' => 'pending',
                'cancelled' => 'cancelled',
                default => 'pending',
            };
            LeaveRequest::query()->whereKey($instance->resource_id)->update(['status' => $status]);
        } elseif ($instance->resource_type === 'onboarding_case') {
            OnboardingCase::query()->whereKey($instance->resource_id)->update(['approval_status' => $instance->status]);
        } elseif ($instance->resource_type === 'offboarding_case') {
            OffboardingCase::query()->whereKey($instance->resource_id)->update(['approval_status' => $instance->status]);
        } elseif ($instance->resource_type === 'document') {
            $document = EmployeeDocument::query()->with('employee.user')->find($instance->resource_id);
            if (! $document) {
                return;
            }

            if ($instance->status === 'pending_approval') {
                if ($document->status !== 'under_review') {
                    $document->update(['status' => 'under_review']);
                }

                return;
            }

            if (! in_array($instance->status, ['approved', 'rejected', 'returned_for_correction'], true)) {
                return;
            }

            $status = $instance->status === 'approved' ? 'approved' : 'rejected';
            if ($document->status === $status && $document->reviewed_at) {
                return;
            }
            $lastAction = $instance->actions()->whereNotNull('comment')->orderByDesc('occurred_at')->first();
            $document->update([
                'status' => $status,
                'review_comment' => $lastAction?->comment,
                'reviewed_by_user_id' => $lastAction?->actor_user_id,
                'reviewed_at' => now(),
            ]);

            $user = $document->employee?->user;
            if ($user) {
                EmployeeNotification::firstOrCreate(
                    ['deduplication_key' => 'document-workflow:'.$instance->id.':'.$status],
                    [
                        'recipient_user_id' => $user->id,
                        'type' => $status === 'approved' ? 'document.approved' : 'document.rejected',
                        'title' => $status === 'approved' ? 'Document approved' : 'Replacement required',
                        'body' => $status === 'approved'
                            ? 'Your document was approved: '.$document->name
                            : 'Your document needs a replacement: '.$document->name.($lastAction?->comment ? ' — '.$lastAction->comment : ''),
                        'resource_type' => 'employee_document',
                        'resource_id' => (string) $document->id,
                    ],
                );
            }
        }
    }

    private function resolveApprovers(WorkflowInstance $instance, array $rule): array
    {
        $candidates = match ($rule['type'] ?? null) {
            'user' => $this->usersById($rule['user_ids'] ?? []),
            'role' => $this->usersForRole((string) ($rule['role_key'] ?? '')),
            'manager_chain' => $this->usersInManagerChain($instance, (int) ($rule['levels'] ?? 1)),
            default => [],
        };

        $unique = [];
        foreach ($candidates as $candidate) {
            if ($candidate['user']->hasPermission('workflow.approve')) {
                $unique[$candidate['user']->id] = $candidate;
            }
        }

        return array_values($unique);
    }

    private function usersById(array $userIds): array
    {
        $users = User::query()->whereIn('id', $userIds)->where('is_active', true)->get()->keyBy('id');
        $candidates = [];
        foreach ($userIds as $userId) {
            $user = $users->get($userId);
            if ($user) {
                $candidates[] = ['user' => $user, 'type' => 'user', 'source' => $user->id];
            }
        }

        return $candidates;
    }

    public function notifyApprover(WorkflowInstance $instance, ApprovalAssignment $assignment): void
    {
        EmployeeNotification::firstOrCreate(
            ['deduplication_key' => 'workflow-assignment:'.$assignment->id],
            [
                'recipient_user_id' => $assignment->approver_user_id,
                'type' => 'workflow.approval_required',
                'title' => 'Approval required',
                'body' => 'A workflow item is waiting for your decision.',
                'resource_type' => 'workflow_instance',
                'resource_id' => $instance->id,
            ],
        );
    }

    private function usersForRole(string $roleKey): array
    {
        $role = Role::query()->where('key', $roleKey)->where('is_active', true)->first();
        if (! $role) {
            return [];
        }

        return $role->users()
            ->where('users.is_active', true)
            ->where(fn (Builder $query) => $query->whereNull('user_roles.valid_from')->orWhere('user_roles.valid_from', '<=', now()))
            ->where(fn (Builder $query) => $query->whereNull('user_roles.valid_until')->orWhere('user_roles.valid_until', '>', now()))
            ->get()
            ->map(fn (User $user) => ['user' => $user, 'type' => 'role', 'source' => $role->key])
            ->all();
    }

    private function usersInManagerChain(WorkflowInstance $instance, int $levels): array
    {
        $employeeId = $this->employeeIdForResource($instance);
        $candidates = [];
        $today = CarbonImmutable::today();

        for ($level = 0; $level < $levels && $employeeId !== null; $level++) {
            $managerId = EmployeeReportingRelationship::query()
                ->where('employee_id', $employeeId)
                ->where('is_primary', true)
                ->whereDate('effective_from', '<=', $today)
                ->where(fn (Builder $query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', $today))
                ->value('manager_employee_id');
            if ($managerId === null) {
                break;
            }
            $manager = User::query()->where('employee_id', $managerId)->where('is_active', true)->first();
            if ($manager) {
                $candidates[] = ['user' => $manager, 'type' => 'manager_chain', 'source' => (string) $managerId];
            }
            $employeeId = (int) $managerId;
        }

        return $candidates;
    }

    public function employeeIdForResource(WorkflowInstance $instance): ?int
    {
        return match ($instance->resource_type) {
            'leave_request' => LeaveRequest::query()->whereKey($instance->resource_id)->value('employee_id'),
            'onboarding_case' => OnboardingCase::query()->whereKey($instance->resource_id)->value('employee_id'),
            'offboarding_case' => OffboardingCase::query()->whereKey($instance->resource_id)->value('employee_id'),
            default => User::query()->whereKey($instance->initiator_user_id)->value('employee_id'),
        };
    }
}
