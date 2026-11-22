<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalAssignment extends Model
{
    use HasUuids;

    protected $fillable = [
        'workflow_step_id', 'approver_user_id', 'sequence_order', 'source_type', 'source_id', 'status', 'activated_at', 'resolved_at',
    ];

    protected function casts(): array
    {
        return ['sequence_order' => 'integer', 'activated_at' => 'datetime', 'resolved_at' => 'datetime'];
    }

    public function step(): BelongsTo
    {
        return $this->belongsTo(WorkflowStep::class, 'workflow_step_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(ApprovalAction::class, 'assignment_id');
    }

    public function delegations(): HasMany
    {
        return $this->hasMany(Delegation::class, 'approval_assignment_id');
    }
}
