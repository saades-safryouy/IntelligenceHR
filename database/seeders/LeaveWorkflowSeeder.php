<?php

namespace Database\Seeders;

use App\Models\WorkflowTemplate;
use Illuminate\Database\Seeder;

class LeaveWorkflowSeeder extends Seeder
{
    public function run(): void
    {
        $definitions = [
            'leave' => [
                'resource_type' => 'leave_request',
                'key' => 'default-leave-approval',
                'name' => 'Leave request approval',
                'steps' => [
                    ['key' => 'manager-review', 'sequence' => 1, 'group_key' => 'manager', 'approver_rule' => ['type' => 'manager_chain', 'levels' => 1]],
                ],
            ],
            'onboarding' => [
                'resource_type' => 'onboarding_case',
                'key' => 'default-onboarding-approval',
                'name' => 'Onboarding approval',
                'steps' => [
                    ['key' => 'manager-review', 'sequence' => 1, 'group_key' => 'manager', 'approver_rule' => ['type' => 'manager_chain', 'levels' => 1]],
                    ['key' => 'hr-review', 'sequence' => 2, 'group_key' => 'hr', 'approver_rule' => ['type' => 'role', 'role_key' => 'hr-admin']],
                ],
            ],
            'offboarding' => [
                'resource_type' => 'offboarding_case',
                'key' => 'default-offboarding-approval',
                'name' => 'Offboarding approval',
                'steps' => [
                    ['key' => 'manager-review', 'sequence' => 1, 'group_key' => 'manager', 'approver_rule' => ['type' => 'manager_chain', 'levels' => 1]],
                    ['key' => 'hr-review', 'sequence' => 2, 'group_key' => 'hr', 'approver_rule' => ['type' => 'role', 'role_key' => 'hr-admin']],
                ],
            ],
        ];

        foreach ($definitions as $module => $definition) {
            $publishedWorkflowExists = WorkflowTemplate::query()
                ->where('module', $module)
                ->where('resource_type', $definition['resource_type'])
                ->where('is_active', true)
                ->whereHas('versions', fn ($query) => $query->where('status', 'published'))
                ->exists();

            if ($publishedWorkflowExists) {
                continue;
            }

            $template = WorkflowTemplate::firstOrCreate(
                ['key' => $definition['key']],
                [
                    'module' => $module,
                    'resource_type' => $definition['resource_type'],
                    'name' => $definition['name'],
                    'is_active' => true,
                ],
            );

            $version = $template->versions()->firstOrCreate(
                ['version_number' => 1],
                ['status' => 'published', 'published_at' => now()],
            );

            foreach ($definition['steps'] as $step) {
                $version->steps()->firstOrCreate(
                    ['key' => $step['key']],
                    [
                        ...$step,
                        'mode' => 'sequential',
                        'completion_rule' => 'all',
                    ],
                );
            }
        }
    }
}
