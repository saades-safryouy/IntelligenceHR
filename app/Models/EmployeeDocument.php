<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeDocument extends Model
{
    use HasUuids;

    protected $fillable = [
        'employee_id', 'name', 'type', 'uploaded_at', 'issue_date', 'expiry_date', 'status',
        'file_path', 'storage_disk', 'mime_type', 'file_size', 'review_comment',
        'reviewed_by_user_id', 'reviewed_at', 'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'uploaded_at' => 'date',
            'issue_date' => 'date',
            'expiry_date' => 'date',
            'reviewed_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function workflowInstances(): HasMany
    {
        return $this->hasMany(WorkflowInstance::class, 'resource_id', 'id')
            ->where('resource_type', 'document')
            ->orderByDesc('created_at');
    }
}
