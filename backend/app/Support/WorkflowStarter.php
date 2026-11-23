<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\User;
use App\Models\WorkflowInstance;
use App\Models\WorkflowTemplate;
use Illuminate\Support\Str;

/**
 * Creates a workflow instance when a leave / onboarding / offboarding
 * request is submitted. Steps come from the published template version;
 * assignments are resolved to real approvers where possible (employee's
 * manager for leave; first HR admin for HR validation; local-it / ISD
 * steps stay unassigned until a user with that role exists).
 */
class WorkflowStarter
{
    public static function startFor(string $resourceType, string $resourceId, string $initiatorUserId, ?Employee $employee = null): ?WorkflowInstance
    {
        $template = WorkflowTemplate::where('resource_type', $resourceType)->where('is_active', true)->first();
        $version = $template?->publishedVersion;
        if (! $template || ! $version) {
            return null;
        }

        $steps = [];
        foreach ($version->steps ?? [] as $index => $step) {
            $assignments = [];
            foreach ($step['assignments'] ?? [] as $a) {
                $assignments[] = $a;
            }
            // Resolve the first assignment's approver from the step's group.
            $approverId = self::resolveApprover($step['group_key'] ?? $step['key'] ?? '', $employee);
            $assignments[] = [
                'id' => (string) Str::uuid(),
                'approver_user_id' => $approverId,
                'sequence_order' => 1,
                'status' => $index === 0 ? 'active' : 'pending',
                'activated_at' => $index === 0 ? now()->toISOString() : null,
                'resolved_at' => null,
                'approver' => $approverId ? self::userLabel($approverId) : null,
                'delegations' => [],
            ];
            $steps[] = array_merge($step, [
                'id' => (string) Str::uuid(),
                'status' => $index === 0 ? 'active' : 'pending',
                'assignments' => $assignments,
            ]);
        }

        $instance = WorkflowInstance::create([
            'initiator_user_id' => $initiatorUserId,
            'resource_type' => $resourceType,
            'resource_id' => $resourceId,
            'status' => 'pending',
            'steps' => $steps,
            'current_step' => 0,
            'submitted_at' => now(),
        ]);

        // Notify the first approver, if one was resolved.
        $firstApprover = $steps[0]['assignments'][0]['approver_user_id'] ?? null;
        if ($firstApprover) {
            Notification::create([
                'user_id' => $firstApprover,
                'title' => 'Approval requested',
                'body' => 'A new '.str_replace('_', ' ', $resourceType).' request awaits your decision.',
                'type' => 'workflow',
                'resource_type' => $resourceType,
                'resource_id' => $resourceId,
            ]);
        }

        return $instance;
    }

    private static function resolveApprover(string $group, ?Employee $employee): ?string
    {
        return match ($group) {
            'manager' => $employee?->manager?->user_id ? (string) $employee->manager->user_id : null,
            'hr' => (string) (User::whereJsonContains('roles', 'hr-admin')->first()?->id
                ?? User::whereJsonContains('roles', 'super-admin')->first()?->id),
            'local-it' => (string) (User::whereJsonContains('roles', 'local-it')->first()?->id ?? ''),
            'isd' => (string) (User::whereJsonContains('roles', 'isd')->first()?->id ?? ''),
            default => null,
        } ?: null;
    }

    private static function userLabel(string $userId): ?array
    {
        $u = User::find($userId);

        return $u ? ['id' => (string) $u->id, 'name' => $u->name] : null;
    }
}
