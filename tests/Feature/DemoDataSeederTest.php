<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DemoDataSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_fixtures_are_idempotent_and_supported_apis_read_them(): void
    {
        config(['demo.user_password' => 'local-demo-password-long-enough']);
        $this->seed(DatabaseSeeder::class);
        $this->seed(DemoDataSeeder::class);
        foreach ([
            'leave_requests',
            'leave_entitlements',
            'onboarding_cases',
            'onboarding_tasks',
            'offboarding_cases',
            'workflow_templates',
            'workflow_template_versions',
            'workflow_template_steps',
            'workflow_instances',
            'workflow_steps',
            'approval_assignments',
            'approval_actions',
            'workflow_events',
            'notifications',
            'audit_logs',
        ] as $table) {
            $this->assertTrue(Schema::hasTable($table), "Missing required table: {$table}");
        }
        $hrUser = User::where('email', 'demo.hr.admin@intelligence-rh.example.test')->firstOrFail();
        $originalPasswordHash = $hrUser->password;
        $this->seed(DemoDataSeeder::class);

        $this->assertSame(100, Employee::where('email', 'like', 'demo.employee.%')->count());
        $this->assertSame(8, DB::table('departments')->where('code', 'like', 'DEMO-%')->count());
        $this->assertSame(20, DB::table('positions')->where('code', 'like', 'DEMO-%')->count());
        $this->assertSame(15, DB::table('workflow_instances')->where('idempotency_key', 'like', 'demo-workflow-%')->count());
        $this->assertSame(35, DB::table('notifications')->where('deduplication_key', 'like', 'demo-%')->orWhere('deduplication_key', 'like', 'demo-workflow-reminder:%')->count());
        $this->assertSame(6, Role::count());
        $this->assertSame(42, Permission::count());
        $this->assertSame($originalPasswordHash, $hrUser->fresh()->password);
        $this->assertSame(0, DB::selectOne('SELECT COUNT(*) AS count FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.email LIKE ? AND e.department_id IS NOT NULL AND d.id IS NULL', ['demo.employee.%'])->count);
        $this->assertSame(0, DB::selectOne('SELECT COUNT(*) AS count FROM employee_reporting_relationships r LEFT JOIN employees e ON e.id = r.employee_id LEFT JOIN employees m ON m.id = r.manager_employee_id WHERE e.id IS NULL OR m.id IS NULL')->count);

        Sanctum::actingAs($hrUser);
        $this->getJson('/api/v1/employees?pageSize=1')->assertOk()->assertJsonPath('total', 100);
        $this->getJson('/api/v1/departments?pageSize=100')->assertOk()->assertJsonPath('total', 8);
        $this->getJson('/api/v1/positions?pageSize=100')->assertOk()->assertJsonPath('total', 20);
        $this->getJson('/api/v1/org-chart')->assertOk();
        $this->getJson('/api/v1/workflow-instances?pageSize=100')->assertOk()->assertJsonPath('total', 15);
        $this->getJson('/api/v1/workflow-templates?pageSize=100')->assertOk()->assertJsonPath('total', 5);
        $this->getJson('/api/v1/workflow-templates?module=leave&pageSize=100')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/v1/workflow-templates?module=onboarding&pageSize=100')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/v1/workflow-templates?module=offboarding&pageSize=100')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/v1/notifications')->assertOk();
        $this->getJson('/api/v1/roles')->assertOk()->assertJsonPath('total', 6);
        $this->getJson('/api/v1/permissions?pageSize=100')->assertOk()->assertJsonPath('total', 42);
    }

    public function test_demo_reset_preserves_non_demo_users_and_rbac_catalogs(): void
    {
        config(['demo.user_password' => 'local-demo-password-long-enough']);
        $this->seed(DatabaseSeeder::class);
        $this->seed(DemoDataSeeder::class);
        $realUser = User::create([
            'name' => 'Existing local account',
            'email' => 'existing.account@example.test',
            'password' => 'existing-account-password',
            'is_active' => true,
        ]);

        $this->artisan('demo:reset', ['--force' => true])->assertExitCode(0);

        $this->assertDatabaseHas('users', ['id' => $realUser->id]);
        $this->assertDatabaseCount('roles', 6);
        $this->assertDatabaseCount('permissions', 42);
        $this->assertDatabaseCount('employees', 0);
        $this->assertDatabaseCount('departments', 0);
        $this->assertDatabaseCount('workflow_instances', 0);
    }
}
