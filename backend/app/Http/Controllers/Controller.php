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
            'employee' => ['people.employee.self.update', 'notification.view'],
            'local-it' => ['workflow.approve', 'workflow.instance.view', 'notification.view'],
            'isd' => ['workflow.approve', 'workflow.instance.view', 'notification.view'],
        ];

        $perms = [];
        foreach ($roles as $role) {
            foreach ($map[$role] ?? [] as $perm) {
                $perms[] = $perm;
            }
        }

        return array_values(array_unique($perms));
    }

    protected function user(): User
    {
        return auth()->user();
    }

    protected function can(string $permission): bool
    {
        $perms = self::permissionsFor($this->user()->roles ?? []);

        return in_array('*', $perms, true) || in_array($permission, $perms, true);
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
