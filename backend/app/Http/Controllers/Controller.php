<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Routing\Controller as BaseController;

abstract class Controller extends BaseController
{
    use AuthorizesRequests, ValidatesRequests;

    /**
     * Permission keys the UI checks (contract §2), mapped from role keys.
     * The server enforces everything; the UI only hides controls.
     */
    public static function permissionsFor(array $roles): array
    {
        $map = [
            'super-admin' => ['*'],
            'bootstrap-admin' => ['*'],
            'hr-admin' => [
                'people.employee.view.all', 'people.employee.view.department',
                'people.employee.create', 'people.employee.update',
                'people.employee.self.update', 'people.reporting.update',
                'people.document.upload', 'people.document.review',
                'people.document.delete', 'people.document.archive',
                'workflow.approve', 'workflow.instance.view', 'workflow.instance.view.all',
                'notification.view',
            ],
            'hr-manager' => [
                'people.employee.view.all', 'people.employee.view.department',
                'people.employee.create', 'people.employee.update',
                'people.employee.self.update', 'people.reporting.update',
                'people.document.upload', 'people.document.review',
                'people.document.delete', 'people.document.archive',
                'workflow.approve', 'workflow.instance.view', 'workflow.instance.view.all',
                'notification.view',
            ],
            'department-manager' => [
                'people.employee.view.department', 'people.employee.self.update',
                'people.reporting.update', 'workflow.approve',
                'workflow.instance.view', 'notification.view',
            ],
            'manager' => [
                'people.employee.view.department', 'people.employee.self.update',
                'workflow.approve', 'workflow.instance.view', 'notification.view',
            ],
            'workflow-approver' => ['workflow.approve', 'workflow.instance.view', 'notification.view'],
            'employee' => ['people.employee.self.update', 'notification.view', 'payroll.payslip.view.self'],
            'local-it' => ['workflow.approve', 'workflow.instance.view', 'notification.view'],
            'isd' => ['workflow.approve', 'workflow.instance.view', 'notification.view'],
            // Payroll (BRD §9.2). No 'payroll-officer' role: decision D-03
            // (hr-admin only, day to day). No 'finance' role: decision
            // D-02 (the accountant uses hr-admin; a separate finance
            // SaaS exists as an optional add-on).
            'platform-admin' => [
                'tenant.manage', 'tenant.switch',
                'payroll.parameter.manage', 'payroll.jurisdiction.manage',
            ],
            'tenant-admin' => [
                'payroll.client_config.manage', 'payroll.settings.manage',
            ],
        ];

        // Payroll permissions per role (BRD §9.2 matrix).
        $payroll = [
            'hr-admin' => [
                'payroll.run.view', 'payroll.run.create', 'payroll.run.calculate',
                'payroll.run.validate', 'payroll.run.approve', 'payroll.run.close',
                'payroll.run.send_back', 'payroll.salary.view', 'payroll.salary.manage',
                'payroll.component.manage', 'payroll.client_config.manage',
                'payroll.payslip.view.all', 'payroll.export', 'payroll.settings.manage',
            ],
            'hr-manager' => ['payroll.run.view', 'payroll.payslip.view.self'],
            'department-manager' => ['payroll.payslip.view.self'],
            'manager' => ['payroll.payslip.view.self'],
        ];
        foreach ($payroll as $role => $perms) {
            $map[$role] = array_values(array_unique(array_merge($map[$role] ?? [], $perms)));
        }

        $perms = [];
        foreach ($roles as $role) {
            foreach ($map[$role] ?? [] as $perm) {
                $perms[] = $perm;
            }
        }

        return array_values(array_unique($perms));
    }

    /**
     * HR-title rule (Saad, 24 Nov 2026): any employee whose job title is an
     * HR title gets FULL HR access. Titles are free text, so the match is an
     * explicit list, checked against job_title OR position_title,
     * case-insensitive. "HR" matches as a whole word only, so words like
     * "through" never match.
     */
    private const HR_TITLE_PATTERNS = [
        '/\bhr\b/i',
        '/human resources/i',
        '/talent acquisition/i',
        '/recruit(er|ment)/i',
        '/people operations/i',
        '/people\s*(?:&|and)\s*culture/i',
    ];

    public static function hasHrTitle(?Employee $employee): bool
    {
        if (! $employee) {
            return false;
        }
        foreach ([$employee->job_title, $employee->position_title] as $title) {
            if (! is_string($title) || $title === '') {
                continue;
            }
            foreach (self::HR_TITLE_PATTERNS as $pattern) {
                if (preg_match($pattern, $title)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * The user's roles plus 'hr-manager' when the linked employee holds an
     * HR title. This is the single source of truth for HR-title access:
     * can(), scopeEmployees() and AuthController::permissions() all read
     * through it, so the frontend's permission-driven role upgrade picks
     * the HR role up automatically. No frontend guard change is needed.
     */
    public static function effectiveRoles(User $user): array
    {
        $roles = $user->roles ?? [];
        if (! in_array('hr-admin', $roles, true)
            && ! in_array('hr-manager', $roles, true)
            && self::hasHrTitle($user->employee)) {
            $roles[] = 'hr-manager';
        }
        // Platform admins are users with tenant_id NULL + the
        // platform_admin flag (decision D-14); the flag grants the role.
        if (! empty($user->platform_admin) && ! in_array('platform-admin', $roles, true)) {
            $roles[] = 'platform-admin';
        }

        return array_values(array_unique($roles));
    }

    protected function user(): User
    {
        return auth()->user();
    }

    protected function can(string $permission): bool
    {
        $perms = self::permissionsFor(self::effectiveRoles($this->user()));

        return in_array('*', $perms, true) || in_array($permission, $perms, true);
    }

    /**
     * Best-effort audit entry for a key mutation. Logging must never break
     * the request it records, so failures are swallowed silently.
     */
    protected function logAudit(string $action, ?string $resourceType, $resourceId, ?string $details = null): void
    {
        try {
            \App\Models\AuditLog::create([
                'user_id' => $this->user()->id ?? null,
                'user_name' => $this->user()->name ?? null,
                'tenant_id' => \App\Support\TenantContext::id() ?? $this->user()->tenant_id ?? null,
                'action' => $action,
                'resource_type' => $resourceType,
                'resource_id' => $resourceId !== null ? (string) $resourceId : null,
                'details' => $details,
            ]);
        } catch (\Throwable) {
            // Audit logging is best-effort by design.
        }
    }

    /** The tenant resolved for this request (BRD §2.2), or null. */
    protected function tenantId(): ?int
    {
        return \App\Support\TenantContext::id();
    }

    protected function forbidden()
    {
        return response()->json(['message' => 'Forbidden.'], 403);
    }

    protected function myEmployee(): ?Employee
    {
        return $this->user()->employee_id ? Employee::find($this->user()->employee_id) : null;
    }

    /** All employee ids in the current user's reporting subtree (incl. self). */
    protected function subtreeIds(): array
    {
        $me = $this->myEmployee();
        if (! $me) {
            return [];
        }
        $ids = [$me->id];
        $queue = [$me->id];
        while ($queue) {
            $next = Employee::whereIn('manager_id', $queue)->pluck('id')->all();
            $ids = array_merge($ids, $next);
            $queue = $next;
        }

        return array_values(array_unique($ids));
    }

    /**
     * Scope an employees query to what the current user may see:
     * HR sees all, managers see their department/subtree, others see self.
     */
    protected function scopeEmployees($query)
    {
        if ($this->can('people.employee.view.all')) {
            return $query;
        }
        if ($this->can('people.employee.view.department')) {
            $me = $this->myEmployee();
            if ($me) {
                return $query->where(function ($q) use ($me) {
                    $q->where('department_id', $me->department_id)
                        ->orWhereIn('id', $this->subtreeIds());
                });
            }
        }
        $me = $this->myEmployee();

        return $me ? $query->where('id', $me->id) : $query->whereRaw('1 = 0');
    }
}
