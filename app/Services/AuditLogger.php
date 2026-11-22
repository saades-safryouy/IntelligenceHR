<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AuditLogger
{
    public function record(
        ?User $actor,
        string $action,
        Model|string $target,
        string|int|null $targetId = null,
        array $changes = [],
        string $outcome = 'success',
    ): AuditLog {
        if ($target instanceof Model) {
            $targetId = $target->getKey();
            $target = $target->getMorphClass();
        }

        return AuditLog::create([
            'actor_user_id' => $actor?->getKey(),
            'action' => $action,
            'target_type' => $target,
            'target_id' => (string) $targetId,
            'outcome' => $outcome,
            'changes' => $changes,
            'correlation_id' => request()->header('X-Request-Id') && Str::isUuid(request()->header('X-Request-Id'))
                ? request()->header('X-Request-Id')
                : (string) Str::uuid(),
            'occurred_at' => now(),
        ]);
    }
}
