<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkflowStep extends Model
{
    use HasUuids;

    protected $fillable = [
        'workflow_instance_id', 'workflow_template_step_id', 'key', 'sequence', 'group_key',
        'mode', 'completion_rule', 'quorum', 'status', 'approver_rule', 'activated_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'quorum' => 'integer',
            'approver_rule' => 'array',
            'activated_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(WorkflowInstance::class, 'workflow_instance_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(ApprovalAssignment::class)->orderBy('sequence_order');
    }
}
