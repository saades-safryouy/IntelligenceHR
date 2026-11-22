<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ResetDemoData extends Command
{
    protected $signature = 'demo:reset {--force : Confirm removal of records marked as demo fixtures}';

    protected $description = 'Remove only records created by the deterministic demo-data seeder.';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('Demo data can only be reset in the local or testing environment.');

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm('Remove seeded demo users, People, workflow and notification records?')) {
            $this->info('No demo data was removed.');

            return self::SUCCESS;
        }

        $counts = DB::transaction(function (): array {
            $userIds = DB::table('users')
                ->where('email', 'like', 'demo.%@intelligence-rh.example.test')
                ->pluck('id');
            $employeeIds = DB::table('employees')
                ->where('email', 'like', 'demo.employee.%@intelligence-rh.example.test')
                ->pluck('id');
            $templateIds = DB::table('workflow_templates')
                ->where('key', 'like', 'demo.%')
                ->pluck('id');
            $versionIds = DB::table('workflow_template_versions')
                ->whereIn('workflow_template_id', $templateIds)
                ->pluck('id');
            $instanceIds = DB::table('workflow_instances')
                ->whereIn('workflow_template_version_id', $versionIds)
                ->where('idempotency_key', 'like', 'demo-workflow-%')
                ->pluck('id');
            $stepIds = DB::table('workflow_steps')->whereIn('workflow_instance_id', $instanceIds)->pluck('id');
            $assignmentIds = DB::table('approval_assignments')->whereIn('workflow_step_id', $stepIds)->pluck('id');

            $actions = DB::table('approval_actions')->whereIn('workflow_instance_id', $instanceIds)->delete();
            DB::table('workflow_events')->whereIn('workflow_instance_id', $instanceIds)->delete();
            DB::table('delegations')->whereIn('approval_assignment_id', $assignmentIds)->delete();
            DB::table('approval_assignments')->whereIn('id', $assignmentIds)->delete();
            DB::table('workflow_steps')->whereIn('id', $stepIds)->delete();
            $instances = DB::table('workflow_instances')->whereIn('id', $instanceIds)->delete();

            $notifications = DB::table('notifications')
                ->where(function ($query) use ($userIds) {
                    $query->whereIn('recipient_user_id', $userIds)
                        ->where(function ($demo) {
                            $demo->where('deduplication_key', 'like', 'demo-notification-%')
                                ->orWhere('deduplication_key', 'like', 'demo-workflow-reminder:%');
                        });
                })
                ->delete();
            DB::table('sessions')->whereIn('user_id', $userIds)->delete();
            DB::table('role_scope_assignments')->whereIn('user_id', $userIds)->delete();
            DB::table('user_roles')->whereIn('user_id', $userIds)->delete();
            $users = DB::table('users')->whereIn('id', $userIds)->delete();

            DB::table('employee_reporting_relationships')
                ->whereIn('employee_id', $employeeIds)
                ->orWhereIn('manager_employee_id', $employeeIds)
                ->delete();
            $employees = DB::table('employees')->whereIn('id', $employeeIds)->delete();

            $positionIds = DB::table('positions')->where('code', 'like', 'DEMO-%')->pluck('id');
            DB::table('positions')->whereIn('id', $positionIds)->update(['reports_to_position_id' => null]);
            $positions = DB::table('positions')->whereIn('id', $positionIds)->delete();
            $teams = DB::table('teams')->where('code', 'like', 'DEMO-TEAM-%')->delete();
            DB::table('departments')->where('code', 'like', 'DEMO-%')->update(['parent_department_id' => null]);
            $departments = DB::table('departments')->where('code', 'like', 'DEMO-%')->delete();

            DB::table('workflow_template_steps')->whereIn('workflow_template_version_id', $versionIds)->delete();
            DB::table('workflow_template_versions')->whereIn('id', $versionIds)->delete();
            $templates = DB::table('workflow_templates')->whereIn('id', $templateIds)->delete();

            return compact('actions', 'instances', 'notifications', 'users', 'employees', 'positions', 'teams', 'departments', 'templates');
        });

        $this->info('Demo records removed. Roles, permissions, role grants, and all non-demo records were preserved.');
        $this->table(['Record type', 'Removed'], collect($counts)->map(fn (int $count, string $type) => [$type, $count])->values()->all());

        return self::SUCCESS;
    }
}
