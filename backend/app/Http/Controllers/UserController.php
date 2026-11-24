<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /** Role keys HR may assign (permissionsFor() is the source of truth). */
    private const ASSIGNABLE_ROLES = [
        'hr-admin', 'hr-manager', 'department-manager', 'manager',
        'workflow-approver', 'employee', 'local-it', 'isd',
    ];

    /** Only a super-admin may grant these. */
    private const PROTECTED_ROLES = ['super-admin', 'bootstrap-admin'];

    public function index()
    {
        if (! $this->can('people.employee.view.all')) {
            return $this->forbidden();
        }
        $users = User::with('employee')->orderBy('name')->get();

        return response()->json(['data' => $users
            ->map(fn ($u) => ApiPresenter::user($u))->values()->all()]);
    }

    public function update(Request $request, User $user)
    {
        if (! $this->can('people.employee.view.all')) {
            return $this->forbidden();
        }
        // Never let anyone lock themselves out of HR access.
        if ((string) $user->id === (string) $this->user()->id) {
            return response()->json(['message' => 'You cannot change your own roles.', 'errors' => ['roles' => ['You cannot change your own roles.']]], 422);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'roles' => ['sometimes', 'required', 'array'],
            'roles.*' => ['string', Rule::in(array_merge(self::ASSIGNABLE_ROLES, self::PROTECTED_ROLES))],
            'employee_id' => ['sometimes', 'nullable', 'integer', 'exists:employees,id'],
        ]);
        if (isset($data['roles'])) {
            $protected = array_intersect($data['roles'], self::PROTECTED_ROLES);
            if ($protected && ! $this->user()->hasRole('super-admin', 'bootstrap-admin')) {
                return response()->json(['message' => 'Only a super-admin can assign super-admin roles.', 'errors' => ['roles' => ['Only a super-admin can assign super-admin roles.']]], 403);
            }
        }
        $user->update($data);
        $this->logAudit('user.updated', 'user', $user->id, $user->email.' roles: '.implode(',', $user->roles ?? []));

        return response()->json(['data' => ApiPresenter::user($user->fresh('employee'))]);
    }

    /** GET /roles — every role key with the permissions it grants. HR only. */
    public function roles()
    {
        if (! $this->can('people.employee.view.all')) {
            return $this->forbidden();
        }
        $out = [];
        foreach (array_merge(self::PROTECTED_ROLES, self::ASSIGNABLE_ROLES) as $role) {
            $out[] = ['key' => $role, 'permissions' => self::permissionsFor([$role])];
        }

        return response()->json(['data' => $out]);
    }
}
