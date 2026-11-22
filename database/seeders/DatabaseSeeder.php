<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $roles = [
            'super-admin' => 'Super Admin',
            'hr-admin' => 'HR Admin',
            'hr-manager' => 'HR Manager',
            'department-manager' => 'Department Manager',
            'employee' => 'Employee',
            'workflow-approver' => 'Workflow Approver',
        ];

        foreach ($roles as $key => $name) {
            Role::firstOrCreate(['key' => $key], ['name' => $name, 'is_active' => true]);
        }

        $permissions = [
            'people.employee.view',
            'people.employee.view.all',
            'people.employee.view.department',
            'people.employee.self.view',
            'people.employee.self.update',
            'people.employee.sensitive.view',
            'people.employee.sensitive.create',
            'people.employee.sensitive.update',
            'people.employee.family.view',
            'people.employee.contact.view',
            'people.employee.create',
            'people.employee.update',
            'people.employee.delete',
            'people.employee.export',
            'people.document.upload',
            'people.document.review',
            'people.document.archive',
            'people.document.delete',
            'people.reporting.update',
            'people.catalog.view',
            'people.catalog.manage',
            'organigram.view',
            'rbac.role.view',
            'rbac.role.create',
            'rbac.role.update',
            'rbac.permission.view',
            'rbac.permission.create',
            'rbac.role_permission.assign',
            'rbac.user_role.view',
            'rbac.user_role.assign',
            'workflow.template.view',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
            'workflow.instance.start',
            'workflow.instance.view',
            'workflow.instance.view.all',
            'workflow.approve',
            'workflow.delegate',
            'workflow.history.view',
            'notification.view',
            'audit.view',
        ];

        foreach ($permissions as $key) {
            $parts = explode('.', $key);
            $module = array_shift($parts);
            $resource = array_shift($parts);
            $actionParts = $parts;
            $action = implode('.', $actionParts);
            Permission::firstOrCreate(
                ['key' => $key],
                ['module' => $module, 'resource' => $resource, 'action' => $action, 'scope' => 'explicit'],
            );
        }

        $this->call([
            HrDomainSeeder::class,
            LeaveWorkflowSeeder::class,
        ]);
    }
}
