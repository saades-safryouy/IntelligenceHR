<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A payslip: one employee in one run (BRD §7.6). calculation_json is
 * the full calculation snapshot (§7.8) — the payslip is generated from
 * it at close, never from live data (FR-50). Snapshots are kept at
 * least 10 years and never hard-deleted (§7.10).
 */
class PayrollPayslip extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'calculation_json' => 'array',
        ];
    }

    public function run()
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
