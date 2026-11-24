<?php

namespace App\Support;

/**
 * Tenancy context (Payroll P1, BRD §2.2, §2.4).
 *
 * The tenant is resolved from the authenticated user (users.tenant_id)
 * by the ResolveTenant middleware, before any controller runs — never
 * from request input. The context lives in the container, so it is
 * request-scoped: console commands (migrations, seeders, queues) have
 * no bound context and are trusted, while HTTP requests always resolve
 * one explicitly.
 *
 * Modes:
 * - tenant:   an authenticated user with a tenant_id — tenant-scoped
 *             queries are restricted to that tenant.
 * - platform: an authenticated platform admin (tenant_id NULL +
 *             platform_admin flag) — no tenant is bound; tenant-scoped
 *             queries return nothing until an explicit, audited tenant
 *             switch exists (P3).
 * - console:  artisan / seeders / queues — trusted, no constraint.
 * - none:     no authenticated user on an HTTP request — fail closed.
 */
final class TenantContext
{
    public const MODE_TENANT = 'tenant';
    public const MODE_PLATFORM = 'platform';
    public const MODE_CONSOLE = 'console';
    public const MODE_NONE = 'none';

    public static function set(?int $tenantId, string $mode): void
    {
        app()->instance('current_tenant_id', $tenantId);
        app()->instance('current_tenant_mode', $mode);
    }

    public static function clear(): void
    {
        app()->forgetInstance('current_tenant_id');
        app()->forgetInstance('current_tenant_mode');
        app()->forgetInstance('current_tenant_switched');
    }

    /** The resolved tenant id, or null when no tenant is bound. */
    public static function id(): ?int
    {
        if (! app()->bound('current_tenant_id')) {
            return null;
        }

        return app('current_tenant_id');
    }

    public static function mode(): string
    {
        // An explicitly bound mode (middleware, or a test) wins over
        // the console default, so the scope can be tested.
        if (app()->bound('current_tenant_mode')) {
            return app('current_tenant_mode');
        }
        if (app()->runningInConsole()) {
            return self::MODE_CONSOLE;
        }

        return self::MODE_NONE;
    }

    /**
     * Explicit platform-admin tenant switch (the P3 endpoint calls
     * this). The switch itself must be audit-logged by the caller with
     * both the admin identity and the tenant acted upon (BRD §2.4
     * rule 8).
     */
    public static function switchTo(int $tenantId): void
    {
        app()->instance('current_tenant_id', $tenantId);
        app()->instance('current_tenant_mode', self::MODE_TENANT);
        app()->instance('current_tenant_switched', true);
    }

    public static function switchBack(): void
    {
        app()->instance('current_tenant_id', null);
        app()->instance('current_tenant_mode', self::MODE_PLATFORM);
        app()->forgetInstance('current_tenant_switched');
    }

    public static function isSwitched(): bool
    {
        return (bool) (app()->bound('current_tenant_switched') && app('current_tenant_switched'));
    }
}
