<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowTemplateStep extends Model
{
    use HasUuids;

    protected $fillable = [
        'workflow_template_version_id', 'key', 'sequence', 'group_key', 'mode',
        'completion_rule', 'quorum', 'approver_rule',
    ];

    protected function casts(): array
    {
        return ['sequence' => 'integer', 'quorum' => 'integer', 'approver_rule' => 'array'];
    }

    public function version(): BelongsTo
    {
        return $this->belongsTo(WorkflowTemplateVersion::class, 'workflow_template_version_id');
    }
}
