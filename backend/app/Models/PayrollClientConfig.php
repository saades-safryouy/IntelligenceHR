<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One version of a tenant's client configuration (BRD §7.7, §4):
 * company settings, payroll frequency/calendar, approval workflow,
 * payslip branding and statutory identifiers, as a JSON snapshot.
 * Effective-dated and versioned like legal parameters (§2.5) — a
 * change creates a new version; history is never rewritten.
 */
class PayrollClientConfig extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'settings_json' => 'array',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
