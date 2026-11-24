<?php

namespace App\Models\Scopes;

use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Global tenant scope (BRD §2.4 rule 2): every query on a tenant-owned
 * model is automatically restricted to the current tenant. Business
 * code never writes ->where('tenant_id', ...) by hand.
 *
 * - tenant mode:   where tenant_id = <resolved tenant>
 * - platform mode: the platform admin has no tenant bound (no explicit
 *                  switch yet) — fail closed, no rows.
 * - none mode:     unauthenticated HTTP request — fail closed.
 * - console mode:  artisan / seeders / queues — trusted, no constraint.
 */
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $mode = TenantContext::mode();

        if ($mode === TenantContext::MODE_TENANT) {
            $builder->where($model->qualifyColumn('tenant_id'), TenantContext::id());

            return;
        }

        if ($mode === TenantContext::MODE_CONSOLE) {
            return;
        }

        // Platform admin without a switch, or unauthenticated: no rows.
        $builder->whereRaw('1 = 0');
    }
}
