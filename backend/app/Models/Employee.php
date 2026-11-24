<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    use BelongsToTenant, HasFactory;

    // NOTE (Payroll P1, BRD §9.3 rule 8): cnss_number is stored as
    // plaintext with a per-tenant unique index in P1. The encrypted
    // cast (§9.3) is deferred to P3: Laravel's encrypted cast
    // randomises ciphertext, so it cannot share a column with a DB
    // unique index — the P3 plan is a separate deterministic hash
    // column for uniqueness plus the encrypted cast for storage.
    // Salary data itself never lives here (§9.3 rule 2).

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'joined_at' => 'date',
            'passport_validity_date' => 'date',
            'personal_info_completed_at' => 'datetime',
            'personal_info_dismissed_until' => 'datetime',
            'spouse_dependent' => 'boolean',
            'dependants_count' => 'integer',
        ];
    }

    public function user()
    {
        return $this->hasOne(User::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function manager()
    {
        return $this->belongsTo(self::class, 'manager_id');
    }

    public function reports()
    {
        return $this->hasMany(self::class, 'manager_id');
    }

    public function leaveRequests()
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function documents()
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    public function entitlements()
    {
        return $this->hasMany(LeaveEntitlement::class);
    }

    public function fullName(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }
}
