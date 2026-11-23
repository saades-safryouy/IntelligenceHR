<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkflowInstance extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'steps' => 'array',
            'submitted_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function initiator()
    {
        return $this->belongsTo(User::class, 'initiator_user_id');
    }

    public function actions()
    {
        return $this->hasMany(WorkflowAction::class)->orderBy('occurred_at');
    }

    /** The owning resource record (leave request / onboarding / offboarding case). */
    public function resource()
    {
        return match ($this->resource_type) {
            'leave_request' => LeaveRequest::find($this->resource_id),
            'onboarding_case' => OnboardingCase::find($this->resource_id),
            'offboarding_case' => OffboardingCase::find($this->resource_id),
            default => null,
        };
    }
}
