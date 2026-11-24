<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A tenant is a client company (BRD §7.1). Platform-level table: it
 * carries no tenant_id itself. The seed tenant ("Demo Company",
 * slug demo-company) holds all pre-tenancy data (§2.6).
 */
class Tenant extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'default_languages' => 'array',
        ];
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function employees()
    {
        return $this->hasMany(Employee::class);
    }

    public function departments()
    {
        return $this->hasMany(Department::class);
    }

    public function jurisdictions()
    {
        return $this->hasMany(TenantJurisdiction::class);
    }

    public function salaryComponents()
    {
        return $this->hasMany(PayrollSalaryComponent::class);
    }

    public function salaryStructures()
    {
        return $this->hasMany(PayrollSalaryStructure::class);
    }

    public function runs()
    {
        return $this->hasMany(PayrollRun::class);
    }

    public function clientConfigs()
    {
        return $this->hasMany(PayrollClientConfig::class);
    }
}
