<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveEntitlement;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use Illuminate\Database\Seeder;

class HrDomainSeeder extends Seeder
{
    public function run(): void
    {
        $leaveTypes = [
            ['code' => 'annual', 'name_key' => 'annualLeave', 'color' => '#10b981', 'paid' => true],
            ['code' => 'sick', 'name_key' => 'sickLeave', 'color' => '#ef4444', 'paid' => true],
            ['code' => 'unpaid', 'name_key' => 'unpaidLeave', 'color' => '#6b7280', 'paid' => false],
            ['code' => 'maternity', 'name_key' => 'maternityLeave', 'color' => '#8b5cf6', 'paid' => true],
            ['code' => 'paternity', 'name_key' => 'paternityLeave', 'color' => '#3b82f6', 'paid' => true],
        ];

        $typeModels = [];
        foreach ($leaveTypes as $data) {
            $typeModels[$data['code']] = LeaveType::firstOrCreate(
                ['code' => $data['code']],
                [...$data, 'is_active' => true],
            );
        }

        $holidays = [
            ['name' => "New Year's Day", 'name_key' => 'holidayNewYear', 'date' => '2026-01-01', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Independence Manifesto', 'name_key' => 'holidayManifesto', 'date' => '2026-01-11', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Labour Day', 'name_key' => 'holidayLabour', 'date' => '2026-05-01', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Throne Day', 'name_key' => 'holidayThrone', 'date' => '2026-07-30', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Oued Ed-Dahab Day', 'name_key' => 'holidayOuedEddahab', 'date' => '2026-08-14', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Revolution Day', 'name_key' => 'holidayRevolution', 'date' => '2026-08-20', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Youth Day', 'name_key' => 'holidayYouth', 'date' => '2026-08-21', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Prophet Birthday', 'name_key' => 'holidayProphet', 'date' => '2026-08-26', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Green March Day', 'name_key' => 'holidayGreenMarch', 'date' => '2026-11-06', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
            ['name' => 'Independence Day', 'name_key' => 'holidayIndependence', 'date' => '2026-11-18', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA'],
        ];

        foreach ($holidays as $holiday) {
            Holiday::firstOrCreate(
                ['name' => $holiday['name'], 'date' => $holiday['date']],
                $holiday,
            );
        }

        $employees = Employee::take(10)->get();
        if ($employees->isNotEmpty() && isset($typeModels['annual'])) {
            foreach ($employees as $employee) {
                LeaveEntitlement::firstOrCreate(
                    ['employee_id' => $employee->id, 'leave_type_id' => $typeModels['annual']->id, 'year' => 2026],
                    ['entitlement' => 22],
                );
            }

            $firstEmp = $employees->first();
            $secondEmp = $employees->skip(1)->first() ?? $firstEmp;

            LeaveRequest::firstOrCreate(
                ['employee_id' => $firstEmp->id, 'start_date' => '2026-11-10', 'end_date' => '2026-11-14'],
                [
                    'leave_type_id' => $typeModels['annual']->id,
                    'from_half' => 'full',
                    'to_half' => 'full',
                    'duration' => 5,
                    'backup_employee_id' => $secondEmp->id,
                    'note' => 'Autumn break',
                    'status' => 'pending',
                    'submitted_at' => now()->subDays(2),
                ],
            );
        }

        $onboardingCase = OnboardingCase::firstOrCreate(
            ['employee_name' => 'Karim Alami'],
            [
                'position' => 'Senior Developer',
                'department' => 'Engineering',
                'start_date' => '2026-11-01',
                'stage' => 'HR Validation',
                'assignee' => 'HR Specialist',
                'progress' => 40,
                'status' => 'On track',
            ],
        );

        if ($onboardingCase->wasRecentlyCreated) {
            OnboardingTask::create([
                'onboarding_case_id' => $onboardingCase->id,
                'label_key' => 'taskSignContract',
                'done' => true,
                'due_date' => '2026-11-02',
                'employee_visible' => true,
            ]);
            OnboardingTask::create([
                'onboarding_case_id' => $onboardingCase->id,
                'label_key' => 'taskUploadId',
                'done' => false,
                'due_date' => '2026-11-05',
                'employee_visible' => true,
            ]);
        }

        OffboardingCase::firstOrCreate(
            ['employee_name' => 'Youssef Bennani'],
            [
                'exit_date' => '2026-11-30',
                'reason' => 'Relocation',
                'replacement' => 'Hiring',
                'stage' => 'Knowledge Transfer',
                'progress' => 60,
                'status' => 'On track',
            ],
        );
    }
}
