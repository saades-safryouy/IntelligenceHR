<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Jurisdiction-profile enablement per tenant (BRD §7.2). One row per
 * tenant per country; re-enabling creates a new version, never edits
 * history. Only a platform admin enables a profile (decision D-16).
 */
class TenantJurisdiction extends Model
{
    use BelongsToTenant, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'enabled_at' => 'datetime',
            'disabled_at' => 'datetime',
        ];
    }

    public function enabledBy()
    {
        return $this->belongsTo(User::class, 'enabled_by');
    }
}
