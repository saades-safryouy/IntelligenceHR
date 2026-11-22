<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RbacController extends Controller
{
    public function roles(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = Role::query()->with('permissions');
        if ($search = trim($filters['q'] ?? '')) {
            $query->where(fn ($q) => $q->whereRaw('LOWER(name) LIKE ?', ['%'.mb_strtolower($search).'%'])
                ->orWhereRaw('LOWER(key) LIKE ?', ['%'.mb_strtolower($search).'%']));
        }
        $result = $query->orderBy('name')->paginate($filters['pageSize'] ?? 25)->appends($request->query());

        return $this->page($result);
    }

    public function createRole(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9][a-z0-9._-]*$/', 'unique:roles,key'],
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);
        $role = DB::transaction(function () use ($data, $audit, $request) {
            $role = Role::create($data);
            $audit->record($request->user(), 'rbac.role.created', $role, changes: ['after' => $role->only(['key', 'name', 'description'])]);

            return $role;
        });

        return response()->json(['data' => $role], 201);
    }

    public function updateRole(Request $request, Role $role, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $before = $role->only(['key', 'name', 'description', 'is_active']);
        DB::transaction(function () use ($role, $data, $audit, $request, $before) {
            $role->fill($data)->save();
            $audit->record($request->user(), 'rbac.role.updated', $role, changes: [
                'before' => $before,
                'after' => $role->only(['key', 'name', 'description', 'is_active']),
            ]);
        });

        return response()->json(['data' => $role->refresh()]);
    }

    public function permissions(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'module' => ['nullable', 'string', 'max:100'],
            'action' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = Permission::query()
            ->when($filters['module'] ?? null, fn ($q, $module) => $q->where('module', $module))
            ->when($filters['action'] ?? null, fn ($q, $action) => $q->where('action', $action))
            ->orderBy('module')->orderBy('key');
        $result = $query->paginate($filters['pageSize'] ?? 25)->appends($request->query());

        return $this->page($result);
    }

    public function createPermission(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:150', 'regex:/^[a-z0-9][a-z0-9._-]*$/', 'unique:permissions,key'],
            'module' => ['required', 'string', 'max:100'],
            'resource' => ['required', 'string', 'max:100'],
            'action' => ['required', 'string', 'max:100'],
            'scope' => ['required', 'string', Rule::in(['explicit', 'all', 'department', 'team', 'self', 'resource'])],
        ]);
        $permission = DB::transaction(function () use ($data, $audit, $request) {
            $permission = Permission::create($data);
            $audit->record($request->user(), 'rbac.permission.created', $permission, changes: ['after' => $permission->only(['key', 'module', 'resource', 'action', 'scope'])]);

            return $permission;
        });

        return response()->json(['data' => $permission], 201);
    }

    public function syncRolePermissions(Request $request, Role $role, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'permissionIds' => ['required', 'array', 'max:500'],
            'permissionIds.*' => ['required', 'uuid', 'distinct', 'exists:permissions,id'],
        ]);
        $before = $role->permissions()->pluck('permissions.id')->all();
        DB::transaction(function () use ($role, $data, $audit, $request, $before) {
            $role->permissions()->sync($data['permissionIds']);
            $audit->record($request->user(), 'rbac.role_permissions.changed', $role, changes: [
                'before' => $before,
                'after' => $data['permissionIds'],
            ]);
        });

        return response()->json(['data' => ['roleId' => $role->id, 'permissionIds' => $role->permissions()->pluck('permissions.id')->values()]]);
    }

    public function userRoles(User $user): JsonResponse
    {
        $user->load(['roles.permissions', 'employee']);

        return response()->json(['data' => [
            'userId' => $user->id,
            'employeeId' => $user->employee_id,
            'roles' => $user->roles->map(fn (Role $role) => [
                'id' => $role->id,
                'key' => $role->key,
                'name' => $role->name,
                'validFrom' => $role->pivot->valid_from,
                'validUntil' => $role->pivot->valid_until,
            ])->values(),
        ]]);
    }

    public function syncUserRoles(Request $request, User $user, AuditLogger $audit): JsonResponse
    {
        abort_if($request->user()->is($user), 403, 'Self-assignment of roles is not permitted.');
        $data = $request->validate([
            'roleIds' => ['required', 'array', 'max:100'],
            'roleIds.*' => ['required', 'uuid', 'distinct', 'exists:roles,id'],
            'scopeAssignments' => ['sometimes', 'array', 'max:100'],
            'scopeAssignments.*.scopeKind' => ['required', 'string', Rule::in(['department', 'team', 'self', 'resource'])],
            'scopeAssignments.*.scopeId' => ['required', 'string', 'max:150'],
            'scopeAssignments.*.validFrom' => ['sometimes', 'nullable', 'date'],
            'scopeAssignments.*.validUntil' => ['sometimes', 'nullable', 'date', 'after:scopeAssignments.*.validFrom'],
        ]);
        $inactive = Role::query()->whereIn('id', $data['roleIds'])->where('is_active', false)->exists();
        abort_if($inactive, 422, 'Inactive roles cannot be assigned.');
        $before = $user->roles()->pluck('roles.id')->all();

        DB::transaction(function () use ($request, $user, $data, $audit, $before) {
            $assignments = collect($data['roleIds'])->mapWithKeys(fn ($roleId) => [
                $roleId => ['assigned_by' => $request->user()->id, 'valid_from' => now()],
            ])->all();
            $user->roles()->sync($assignments);

            if (array_key_exists('scopeAssignments', $data)) {
                DB::table('role_scope_assignments')->where('user_id', $user->id)->delete();
                foreach ($data['scopeAssignments'] as $scope) {
                    DB::table('role_scope_assignments')->insert([
                        'id' => (string) \Illuminate\Support\Str::uuid(),
                        'user_id' => $user->id,
                        'scope_kind' => $scope['scopeKind'],
                        'scope_id' => $scope['scopeId'],
                        'valid_from' => $scope['validFrom'] ?? now(),
                        'valid_until' => $scope['validUntil'] ?? null,
                        'assigned_by' => $request->user()->id,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            $audit->record($request->user(), 'rbac.user_roles.changed', $user, changes: [
                'before' => $before,
                'after' => $data['roleIds'],
                'scope_assignments' => $data['scopeAssignments'] ?? null,
            ]);
        });

        return $this->userRoles($user->refresh());
    }

    public function mePermissions(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->activeRoles()
            ->with('permissions')
            ->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('key'))
            ->unique()
            ->values()]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'actorUserId' => ['nullable', 'uuid', 'exists:users,id'],
            'targetType' => ['nullable', 'string', 'max:100'],
            'targetId' => ['nullable', 'string', 'max:150'],
            'action' => ['nullable', 'string', 'max:150'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = \App\Models\AuditLog::query()
            ->when($filters['actorUserId'] ?? null, fn ($q, $id) => $q->where('actor_user_id', $id))
            ->when($filters['targetType'] ?? null, fn ($q, $type) => $q->where('target_type', $type))
            ->when($filters['targetId'] ?? null, fn ($q, $id) => $q->where('target_id', $id))
            ->when($filters['action'] ?? null, fn ($q, $action) => $q->where('action', $action))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->where('occurred_at', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->where('occurred_at', '<=', $to))
            ->orderByDesc('occurred_at');

        return $this->page($query->paginate($filters['pageSize'] ?? 25)->appends($request->query()));
    }

    private function page(\Illuminate\Contracts\Pagination\LengthAwarePaginator $result): JsonResponse
    {
        return response()->json([
            'data' => $result->items(),
            'page' => $result->currentPage(),
            'pageSize' => $result->perPage(),
            'total' => $result->total(),
        ]);
    }
}
