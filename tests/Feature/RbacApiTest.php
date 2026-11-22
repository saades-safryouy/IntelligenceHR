<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class RbacApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    public function test_role_and_user_assignments_are_authorized_and_audited(): void
    {
        $admin = $this->createUserWithPermissions([
            'rbac.role.view',
            'rbac.role.create',
            'rbac.permission.view',
            'rbac.role_permission.assign',
            'rbac.user_role.view',
            'rbac.user_role.assign',
        ]);
        $target = User::factory()->create();
        $newPermission = Permission::create([
            'key' => 'reports.export',
            'module' => 'reports',
            'resource' => 'report',
            'action' => 'export',
            'scope' => 'explicit',
        ]);

        $role = $this->actingAs($admin)->postJson('/api/v1/roles', [
            'key' => 'reports-reader',
            'name' => 'Reports Reader',
        ])->assertCreated()->json('data');

        $this->putJson('/api/v1/roles/'.$role['id'].'/permissions', [
            'permissionIds' => [$newPermission->id],
        ])->assertOk()->assertJsonPath('data.permissionIds.0', $newPermission->id);
        $this->putJson('/api/v1/users/'.$target->id.'/roles', [
            'roleIds' => [$role['id']],
        ])->assertOk()->assertJsonPath('data.roles.0.id', $role['id']);

        $this->putJson('/api/v1/users/'.$admin->id.'/roles', [
            'roleIds' => [$role['id']],
        ])->assertForbidden();

        $this->assertDatabaseHas('audit_logs', ['action' => 'rbac.role_permissions.changed']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'rbac.user_roles.changed']);
    }

    public function test_rbac_api_denies_users_without_management_permissions(): void
    {
        $ordinaryUser = User::factory()->create();

        $this->actingAs($ordinaryUser)->getJson('/api/v1/roles')->assertForbidden();
        $this->actingAs($ordinaryUser)->postJson('/api/v1/roles', [
            'key' => 'forbidden',
            'name' => 'Forbidden',
        ])->assertForbidden();
    }
}
