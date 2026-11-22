<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProvisionRbacAdministratorTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_provisions_a_password_hashed_rbac_only_administrator(): void
    {
        $this->seed();

        $this->artisan('app:provision-rbac-admin')
            ->expectsQuestion('Administrator name', 'Initial Administrator')
            ->expectsQuestion('Administrator email', 'first-admin@example.test')
            ->expectsQuestion('Initial password (minimum 14 characters)', 'secure-initial-password')
            ->expectsConfirmation('Create the first RBAC administrator account?', 'yes')
            ->assertSuccessful();

        $user = User::query()->where('email', 'first-admin@example.test')->firstOrFail();
        $this->assertTrue(Hash::check('secure-initial-password', $user->password));
        $this->assertTrue($user->hasPermission('rbac.role.create'));
        $this->assertFalse($user->hasPermission('people.employee.view.all'));
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $user->id,
            'action' => 'rbac.bootstrap_admin.provisioned',
        ]);
    }
}
