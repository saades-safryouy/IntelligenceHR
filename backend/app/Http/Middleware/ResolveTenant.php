<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;

/**
 * Resolves the current tenant from the authenticated user (BRD §2.2,
 * §8): users.tenant_id — never a header, query parameter or URL
 * segment. Registered on the authenticated route group, after
 * auth:sanctum, so $request->user() is available.
 *
 * - Tenant user    -> tenant mode, bound to users.tenant_id.
 * - Platform admin (tenant_id NULL + platform_admin flag) -> platform
 *   mode, no tenant bound (explicit audited switching lands in P3).
 * - Tenant user with tenant_id NULL (missed backfill) -> binds nothing:
 *   the scope fails closed rather than leaking data.
 */
class ResolveTenant
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if ($user) {
            if ($user->platform_admin) {
                TenantContext::set(null, TenantContext::MODE_PLATFORM);
            } elseif ($user->tenant_id !== null) {
                TenantContext::set((int) $user->tenant_id, TenantContext::MODE_TENANT);
            }
        }

        return $next($request);
    }
}
