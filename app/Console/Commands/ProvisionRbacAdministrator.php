<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ProvisionRbacAdministrator extends Command
{
    protected $signature = 'app:provision-rbac-admin';

    protected $description = 'Interactively create the first account that can administer RBAC.';

    public function handle(): int
    {
        if (User::query()->whereHas('roles', fn ($query) => $query->where('key', 'bootstrap-admin'))->exists()) {
            $this->components->error('An RBAC bootstrap administrator already exists.');

            return self::FAILURE;
        }

        $name = trim((string) $this->ask('Administrator name', 'HRMS Administrator'));
        $emailInput = $this->ask('Administrator email');
        $email = is_string($emailInput) ? mb_strtolower(trim($emailInput)) : '';
        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || User::query()->where('email', $email)->exists()) {
            $this->components->error('A valid, unused email address is required.');

            return self::FAILURE;
        }
        $password = $this->secret('Initial password (minimum 14 characters)');
        if (! is_string($password) || mb_strlen($password) < 14) {
            $this->components->error('The initial password must contain at least 14 characters.');

            return self::FAILURE;
        }
        if (! $this->confirm('Create the first RBAC administrator account?', false)) {
            $this->components->warn('No account was created.');

            return self::SUCCESS;
        }

        $requiredPermissions = [
            'rbac.role.view',
            'rbac.role.create',
            'rbac.role.update',
            'rbac.permission.view',
            'rbac.permission.create',
            'rbac.role_permission.assign',
            'rbac.user_role.view',
            'rbac.user_role.assign',
            'audit.view',
        ];
        $permissionIds = Permission::query()->whereIn('key', $requiredPermissions)->pluck('id', 'key');
        if ($permissionIds->count() !== count($requiredPermissions)) {
            $this->components->error('Seed the RBAC permission catalog before provisioning the administrator.');

            return self::FAILURE;
        }

        $user = DB::transaction(function () use ($name, $email, $password, $permissionIds) {
            $role = Role::firstOrCreate(
                ['key' => 'bootstrap-admin'],
                ['name' => 'Bootstrap Administrator', 'description' => 'Technical bootstrap role; grant only approved access.', 'is_active' => true],
            );
            $role->permissions()->sync($permissionIds->values());

            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => Hash::make($password),
                'is_active' => true,
            ]);
            $user->roles()->attach($role->id, ['assigned_by' => $user->id, 'valid_from' => now()]);

            AuditLog::create([
                'actor_user_id' => $user->id,
                'action' => 'rbac.bootstrap_admin.provisioned',
                'target_type' => 'user',
                'target_id' => $user->id,
                'outcome' => 'success',
                'changes' => ['role_key' => $role->key],
                'correlation_id' => (string) Str::uuid(),
                'occurred_at' => now(),
            ]);

            return $user;
        });

        $this->components->info("Bootstrap administrator created: {$user->email}");
        $this->components->warn('Assign only approved permissions and roles. This command does not assign People, sensitive-field, or approval permissions.');

        return self::SUCCESS;
    }
}
