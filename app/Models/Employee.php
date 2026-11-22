<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'first_name', 'last_name', 'job_title', 'department_id', 'team_id', 'position_id',
        'employment_type', 'status', 'location', 'country', 'joined_at', 'hire_source', 'email', 'gender',
        'marital_status', 'number_of_children', 'national_id', 'nationality_id', 'passport_number',
        'passport_validity_date', 'personal_phone', 'professional_phone',
        'personal_info_completed_at', 'personal_info_dismissed_until', 'emergency_contact_name',
        'emergency_contact_phone', 'emergency_contact_relationship',
    ];

    protected function casts(): array
    {
        return [
            'joined_at' => 'date',
            'passport_validity_date' => 'date',
            'personal_info_completed_at' => 'datetime',
            'personal_info_dismissed_until' => 'datetime',
            'number_of_children' => 'integer',
            'nationality_id' => 'integer',
        ];
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    public function reportingRelationships(): HasMany
    {
        return $this->hasMany(EmployeeReportingRelationship::class);
    }

    public function directReports(): HasMany
    {
        return $this->hasMany(EmployeeReportingRelationship::class, 'manager_employee_id');
    }

    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    public function latestOnboardingCase(): HasOne
    {
        return $this->hasOne(OnboardingCase::class)->latestOfMany();
    }

    public function latestOffboardingCase(): HasOne
    {
        return $this->hasOne(OffboardingCase::class)->latestOfMany();
    }

    public function employeeDocuments(): HasMany
    {
        return $this->hasMany(EmployeeDocument::class);
    }
}
