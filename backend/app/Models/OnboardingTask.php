<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OnboardingTask extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['done' => 'boolean', 'employee_visible' => 'boolean', 'due_date' => 'date'];
    }

    public function onboardingCase()
    {
        return $this->belongsTo(OnboardingCase::class);
    }
}
