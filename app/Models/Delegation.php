<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Delegation extends Model
{
    use HasUuids;

    protected $fillable = [
        'delegator_user_id', 'delegate_user_id', 'approval_assignment_id', 'role_id',
        'starts_at', 'ends_at', 'created_by', 'revoked_at',
    ];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function delegator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegator_user_id');
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_user_id');
    }

    public function assignment(): BelongsTo
    {
        return $this->belongsTo(ApprovalAssignment::class, 'approval_assignment_id');
    }
}
