<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkflowTemplateVersion extends Model
{
    use HasUuids;

    protected $fillable = ['workflow_template_id', 'version_number', 'status', 'published_at', 'published_by'];

    protected function casts(): array
    {
        return ['version_number' => 'integer', 'published_at' => 'datetime'];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(WorkflowTemplate::class, 'workflow_template_id');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(WorkflowTemplateStep::class);
    }
}
