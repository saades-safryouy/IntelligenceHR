<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One recurring component line of a salary structure (BRD §7.6):
 * a component (by id) with its amount for the period. component_code
 * is denormalised so the line keeps its meaning even if the component
 * row is later deleted (component_id then becomes null).
 */
class PayrollStructureLine extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
        ];
    }

    public function structure()
    {
        return $this->belongsTo(PayrollSalaryStructure::class, 'salary_structure_id');
    }

    public function component()
    {
        return $this->belongsTo(PayrollSalaryComponent::class, 'component_id');
    }
}
