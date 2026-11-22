<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OnboardingCase extends Model
{
    use HasUuids;

    protected $fillable = ['employee_id', 'employee_name', 'position', 'department', 'start_date', 'stage', 'assignee', 'progress', 'status', 'approval_status'];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'progress' => 'integer',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(OnboardingTask::class);
    }
}
