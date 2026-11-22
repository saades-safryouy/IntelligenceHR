<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OnboardingTask extends Model
{
    use HasUuids;

    protected $fillable = ['onboarding_case_id', 'label_key', 'done', 'due_date', 'employee_visible'];

    protected function casts(): array
    {
        return [
            'done' => 'boolean',
            'due_date' => 'date',
            'employee_visible' => 'boolean',
        ];
    }

    public function onboardingCase(): BelongsTo
    {
        return $this->belongsTo(OnboardingCase::class);
    }
}
