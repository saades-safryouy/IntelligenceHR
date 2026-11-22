<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PostgresDemoDataTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Run with phpunit.pgsql.xml against the populated local PostgreSQL database.');
        }
    }

    public function test_postgres_demo_fixtures_have_valid_relationships_and_api_responses(): void
    {
        $this->assertSame(100, DB::table('employees')->where('email', 'like', 'demo.employee.%@intelligence-rh.example.test')->count());
        $this->assertSame(8, DB::table('departments')->where('code', 'like', 'DEMO-%')->count());
        $this->assertSame(20, DB::table('positions')->where('code', 'like', 'DEMO-%')->count());
        $this->assertSame(15, DB::table('workflow_instances')->where('idempotency_key', 'like', 'demo-workflow-%')->count());
        $this->assertSame(6, DB::table('roles')->count());
        $this->assertSame(38, DB::table('permissions')->count());
        $this->assertSame(0, DB::table('employees')
            ->where('email', 'like', 'demo.employee.%@intelligence-rh.example.test')
            ->whereDate('joined_at', '>', '2026-10-16')
            ->count());

        $orphanedEmployees = DB::table('employees as e')
            ->leftJoin('departments as d', 'd.id', '=', 'e.department_id')
            ->leftJoin('positions as p', 'p.id', '=', 'e.position_id')
            ->where('e.email', 'like', 'demo.employee.%@intelligence-rh.example.test')
            ->where(fn ($query) => $query->whereNull('d.id')->orWhereNull('p.id'))
            ->count();
        $this->assertSame(0, $orphanedEmployees);
        $invalidApprovalActors = DB::table('approval_actions as approval_action')
            ->join('approval_assignments as assignment', 'assignment.id', '=', 'approval_action.assignment_id')
            ->whereIn('approval_action.workflow_instance_id', DB::table('workflow_instances')->select('id')->where('idempotency_key', 'like', 'demo-workflow-%'))
            ->whereColumn('approval_action.actor_user_id', '!=', 'assignment.approver_user_id')
            ->count();
        $this->assertSame(0, $invalidApprovalActors);
        $invalidReminderRecipients = DB::table('notifications as notification')
            ->join('approval_assignments as assignment', function ($join): void {
                $join->on('notification.deduplication_key', '=', DB::raw("'demo-workflow-reminder:' || assignment.id"));
            })
            ->whereIn('assignment.workflow_step_id', DB::table('workflow_steps as step')
                ->join('workflow_instances as instance', 'instance.id', '=', 'step.workflow_instance_id')
                ->select('step.id')
                ->where('instance.idempotency_key', 'like', 'demo-workflow-%'))
            ->whereColumn('notification.recipient_user_id', '!=', 'assignment.approver_user_id')
            ->count();
        $this->assertSame(0, $invalidReminderRecipients);

        $cycleCount = DB::selectOne(<<<'SQL'
            WITH RECURSIVE reporting(employee_id, manager_employee_id, path, has_cycle) AS (
                SELECT employee_id, manager_employee_id, ARRAY[employee_id, manager_employee_id], employee_id = manager_employee_id
                FROM employee_reporting_relationships
                WHERE is_primary = true AND effective_from <= DATE '2026-10-16'
                  AND (effective_to IS NULL OR effective_to >= DATE '2026-10-16')
                UNION ALL
                SELECT reporting.employee_id, next.manager_employee_id,
                       reporting.path || next.manager_employee_id,
                       next.manager_employee_id = ANY(reporting.path)
                FROM reporting
                JOIN employee_reporting_relationships next ON next.employee_id = reporting.manager_employee_id
                WHERE reporting.has_cycle = false AND next.is_primary = true
                  AND next.effective_from <= DATE '2026-10-16'
                  AND (next.effective_to IS NULL OR next.effective_to >= DATE '2026-10-16')
            )
            SELECT COUNT(*) AS count FROM reporting WHERE has_cycle = true
            SQL)->count;
        $this->assertSame(0, (int) $cycleCount);

        Sanctum::actingAs(User::where('email', 'demo.hr.admin@intelligence-rh.example.test')->firstOrFail());
        $this->getJson('/api/v1/employees?pageSize=1')->assertOk()->assertJsonPath('total', 100);
        $this->getJson('/api/v1/departments?pageSize=100')->assertOk()->assertJsonPath('total', 8);
        $this->getJson('/api/v1/positions?pageSize=100')->assertOk()->assertJsonPath('total', 20);
        $this->getJson('/api/v1/org-chart')->assertOk();
        $this->getJson('/api/v1/workflow-instances?pageSize=100')->assertOk()->assertJsonPath('total', 15);
        $this->getJson('/api/v1/workflow-templates?pageSize=100')->assertOk()->assertJsonPath('total', 2);
        $this->getJson('/api/v1/notifications')->assertOk();
        $this->getJson('/api/v1/roles')->assertOk()->assertJsonPath('total', 6);
        $this->getJson('/api/v1/permissions?pageSize=100')->assertOk()->assertJsonPath('total', 38);
    }

    public function test_postgres_demo_account_can_authenticate_without_disclosing_its_password(): void
    {
        $password = config('demo.user_password');
        $this->assertIsString($password);
        $this->assertGreaterThanOrEqual(14, strlen($password));

        $this->withHeaders(['Origin' => 'http://localhost:5173'])->postJson('/api/v1/auth/login', [
            'email' => 'demo.hr.admin@intelligence-rh.example.test',
            'password' => $password,
        ])->assertOk()->assertJsonPath('data.user.email', 'demo.hr.admin@intelligence-rh.example.test');
    }
}
