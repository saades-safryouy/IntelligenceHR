<?php

namespace App\Models\Concerns;

use App\Models\Scopes\TenantScope;
use App\Support\TenantContext;

/**
 * Marks a model as tenant-owned (BRD §2.4): every row carries
 * tenant_id, every query is auto-scoped to the current tenant, and
 * tenant_id is always set from the session — never from request input.
 *
 * Apply to every tenant-owned model. Do NOT apply to User (auth looks
 * users up by email before any tenant is known) or to shared tables
 * (tenants, payroll_legal_parameters).
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function ($model) {
            // The tenant comes from the session, never from input: an
            // explicitly provided tenant_id is overwritten, not trusted.
            if (TenantContext::id() !== null) {
                $model->tenant_id = TenantContext::id();
            }
        });
    }

    public function tenant()
    {
        return $this->belongsTo(\App\Models\Tenant::class);
    }
}
