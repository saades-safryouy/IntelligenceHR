<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\EmployeeReportingRelationship;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class EmployeeVisibility
{
    /**
     * Return only current primary-reporting descendants that are also visible
     * under the user's existing employee scope.
     *
     * @return list<int>
     */
    public function reportingDescendantIds(User $user): array
    {
        if (! $user->employee_id) {
            return [];
        }

        $visibleEmployeeIds = $this->query($user)->select('employees.id');
        $visited = [(int) $user->employee_id => true];
        $frontier = [(int) $user->employee_id];
        $descendants = [];
        $today = now()->toDateString();

        while ($frontier !== []) {
            $children = EmployeeReportingRelationship::query()
                ->whereIn('manager_employee_id', $frontier)
                ->where('is_primary', true)
                ->whereDate('effective_from', '<=', $today)
                ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', $today))
                ->whereIn('employee_id', clone $visibleEmployeeIds)
                ->pluck('employee_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $frontier = [];
            foreach ($children as $employeeId) {
                if (isset($visited[$employeeId])) {
                    continue;
                }
                $visited[$employeeId] = true;
                $descendants[] = $employeeId;
                $frontier[] = $employeeId;
            }
        }

        return $descendants;
    }

    public function query(User $user): Builder
    {
        $query = Employee::query();

        if ($user->hasPermission('people.employee.view.all')) {
            return $query;
        }

        $departmentIds = DB::table('role_scope_assignments')
            ->where('scope_kind', 'department')
            ->where(function ($scope) use ($user) {
                $scope->where('user_id', $user->id)
                    ->orWhereIn('role_id', $user->roles()
                        ->where(fn ($roles) => $roles
                            ->whereNull('user_roles.valid_from')
                            ->orWhere('user_roles.valid_from', '<=', now()))
                        ->where(fn ($roles) => $roles
                            ->whereNull('user_roles.valid_until')
                            ->orWhere('user_roles.valid_until', '>', now()))
                        ->select('roles.id'));
            })
            ->where(fn ($validity) => $validity->whereNull('valid_from')->orWhere('valid_from', '<=', now()))
            ->where(fn ($validity) => $validity->whereNull('valid_until')->orWhere('valid_until', '>', now()))
            ->pluck('scope_id')
            ->all();

        if ($user->hasPermission('people.employee.view.department') && $departmentIds !== []) {
            return $query->whereIn('department_id', $departmentIds);
        }

        if ($user->employee_id && (
            $user->hasPermission('people.employee.self.view')
            || $user->hasPermission('people.employee.view.department')
            || $user->hasPermission('people.employee.view')
        )) {
            return $query->whereKey($user->employee_id);
        }

        return $query->whereRaw('1 = 0');
    }

    public function canSee(User $user, Employee $employee): bool
    {
        return $this->query($user)->whereKey($employee->getKey())->exists();
    }
}
