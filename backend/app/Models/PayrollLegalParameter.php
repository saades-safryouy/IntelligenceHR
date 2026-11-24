<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Effective-dated legal parameters (BRD §7.4, §11.1). Profile-owned
 * and SHARED across tenants — one Moroccan rate set serves every
 * Moroccan tenant — so this table deliberately carries NO tenant_id
 * and does NOT use BelongsToTenant.
 *
 * The engine reads every number from here; a missing key fails the
 * run with "missing parameter" — it never falls back to a hardcoded
 * value. Rows are immutable once used by a closed run; a correction
 * creates a new version.
 */
class PayrollLegalParameter extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'value' => 'decimal:4',
            'valid_from' => 'date',
            'valid_to' => 'date',
        ];
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
