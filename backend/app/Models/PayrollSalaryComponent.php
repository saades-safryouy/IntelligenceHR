<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One entry of a tenant's salary-component catalog (BRD §7.5, FR-11).
 * Components are generic building blocks: the code is unique per
 * tenant, the treatment flags are generic (social-contribution-subject,
 * tax-subject, cap shape), and the jurisdiction profile decides the
 * exemption — the core never assumes the two exemption tables agree
 * (FR-12). No global seeded catalog with legal meaning: the core seeds
 * only structural components (base salary, overtime) in P3.
 */
class PayrollSalaryComponent extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'cnss_subject' => 'boolean',
            'ir_subject' => 'boolean',
            'cap_value' => 'decimal:4',
            'counts_toward_tax_abatement' => 'boolean',
            'is_system' => 'boolean',
            'active' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function structureLines()
    {
        return $this->hasMany(PayrollStructureLine::class, 'component_id');
    }
}
