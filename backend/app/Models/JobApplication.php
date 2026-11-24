<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class JobApplication extends Model
{
    use HasFactory;

    protected $guarded = [];

    public function job()
    {
        return $this->belongsTo(Job::class);
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class);
    }

    public function onboardingCase()
    {
        return $this->belongsTo(OnboardingCase::class, 'onboarding_case_id');
    }

    public function interviews()
    {
        return $this->hasMany(Interview::class, 'application_id');
    }
}
