<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A payroll run: one period + one scope for one tenant (BRD §7.6,
 * FR-20/FR-21). States: draft → validated → approved → closed; the
 * lifecycle API lands in P3. The run records the exact versions used
 * (jurisdiction profile, client config, component catalog) so any
 * historical run can be reproduced (FR-25).
 */
class PayrollRun extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'totals' => 'array',
        ];
    }

    public function payslips()
    {
        return $this->hasMany(PayrollPayslip::class, 'payroll_run_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
