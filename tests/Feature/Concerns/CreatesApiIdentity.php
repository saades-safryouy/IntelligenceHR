<?php

namespace Tests\Feature\Concerns;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Str;

trait CreatesApiIdentity
{
    protected function createUserWithPermissions(array $permissionKeys, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $role = Role::create([
            'key' => 'test-'.Str::uuid(),
            'name' => 'Test role',
            'is_active' => true,
        ]);

        foreach ($permissionKeys as $key) {
            $parts = explode('.', $key);
            Permission::firstOrCreate(
                ['key' => $key],
                [
                    'module' => $parts[0] ?? 'test',
                    'resource' => $parts[1] ?? 'test',
                    'action' => implode('.', array_slice($parts, 2)) ?: 'access',
                    'scope' => 'test',
                ],
            );
        }

        $role->permissions()->sync(Permission::whereIn('key', $permissionKeys)->pluck('id'));
        $user->roles()->attach($role->id, ['valid_from' => now()]);

        return $user;
    }
}
