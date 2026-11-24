<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, HasUuids, Notifiable;

    // tenant_id is deliberately NOT in $fillable (BRD §2.4 rule 3):
    // it is never accepted from request input. It is set by the
    // migration backfill and the seeder (via forceFill), and by the
    // BelongsToTenant creating hook from the session tenant.
    protected $fillable = ['name', 'email', 'password', 'roles', 'employee_id'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'roles' => 'array',
            'tenant_id' => 'integer',
            'platform_admin' => 'boolean',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    /** Platform admin = tenant_id NULL + platform_admin flag (decision D-14). */
    public function isPlatformAdmin(): bool
    {
        return (bool) $this->platform_admin;
    }

    public function hasRole(string ...$roles): bool
    {
        return count(array_intersect($roles, $this->roles ?? [])) > 0;
    }

    public function isAdmin(): bool
    {
        return $this->hasRole('super-admin', 'bootstrap-admin', 'hr-admin');
    }
}
