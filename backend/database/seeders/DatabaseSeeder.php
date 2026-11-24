<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Goal;
use App\Models\Holiday;
use App\Models\LeaveEntitlement;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Notification;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use App\Models\AttendanceRecord;
use App\Models\Candidate;
use App\Models\Interview;
use App\Models\Job;
use App\Models\JobApplication;
use App\Models\PerformanceReview;
use App\Models\ReviewCycle;
use App\Models\Tenant;
use App\Models\TrainingCourse;
use App\Models\TrainingEnrollment;
use App\Models\User;
use App\Models\WorkflowTemplate;
use App\Models\WorkflowTemplateVersion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // --- Seed tenant (Payroll P1, BRD §2.6): all pre-tenancy data
        // belongs to "Demo Company". Every row created below carries its
        // id, and the sweep at the end of this section backfills any
        // row that missed it (e.g. users created by other paths).
        $tenant = Tenant::firstOrCreate(['slug' => 'demo-company'], [
            'name' => 'Demo Company',
            'status' => 'active',
            'default_jurisdiction' => 'MA',
            'default_currency' => 'MAD',
            'default_languages' => ['fr', 'ar'],
        ]);
        // tenant_id is deliberately not in User::$fillable (never from
        // request input), so users get it via forceFill, not mass
        // assignment.
        $assignTenantToUser = function (User $user) use ($tenant): void {
            if ($user->tenant_id === null) {
                $user->forceFill(['tenant_id' => $tenant->id])->save();
            }
        };

        // --- Departments (ids are the short strings the frontend seeds use) ---
        $departments = [
            ['id' => 'eng', 'name' => 'Engineering', 'code' => 'ENG', 'employee_count' => 64, 'budget' => 1200000, 'tenant_id' => $tenant->id],
            ['id' => 'ops', 'name' => 'Operations', 'code' => 'OPS', 'employee_count' => 48, 'budget' => 800000, 'tenant_id' => $tenant->id],
            ['id' => 'sales', 'name' => 'Commercial', 'code' => 'SAL', 'employee_count' => 37, 'budget' => 950000, 'tenant_id' => $tenant->id],
            ['id' => 'finance', 'name' => 'Finance', 'code' => 'FIN', 'employee_count' => 21, 'budget' => 500000, 'tenant_id' => $tenant->id],
            ['id' => 'people', 'name' => 'People & Culture', 'code' => 'PPL', 'employee_count' => 14, 'budget' => 300000, 'tenant_id' => $tenant->id],
        ];
        foreach ($departments as $d) {
            Department::updateOrCreate(['id' => $d['id']], $d);
        }

        // --- Leave types ---
        foreach ([
            ['id' => 'annual', 'code' => 'ANNUAL', 'name_key' => 'leave.annual', 'color' => '#3b82f6', 'paid' => true, 'default_entitlement_days' => 25, 'carry_over_days' => 5, 'requires_approval' => true],
            ['id' => 'sick', 'code' => 'SICK', 'name_key' => 'leave.sick', 'color' => '#f59e0b', 'paid' => true, 'default_entitlement_days' => 12, 'carry_over_days' => 0, 'requires_approval' => true],
            ['id' => 'unpaid', 'code' => 'UNPAID', 'name_key' => 'leave.unpaid', 'color' => '#a78bfa', 'paid' => false, 'default_entitlement_days' => 30, 'carry_over_days' => 0, 'requires_approval' => true],
        ] as $lt) {
            LeaveType::updateOrCreate(['id' => $lt['id']], $lt);
        }

        // --- Users + employees (ids 1043-1048, as in the frontend mock data) ---
        $people = [
            ['id' => 1043, 'first_name' => 'Nadia', 'last_name' => 'Rahmani', 'job_title' => 'Engineering Manager', 'department_id' => 'eng', 'email' => 'nadia.rahmani@intillj.com', 'roles' => ['department-manager'], 'manager_id' => null, 'gender' => 'Female', 'country' => 'MA', 'location' => 'Casablanca', 'joined_at' => '2021-03-01'],
            ['id' => 1044, 'first_name' => 'Karim', 'last_name' => 'Haddad', 'job_title' => 'Operations Manager', 'department_id' => 'ops', 'email' => 'karim.haddad@intillj.com', 'roles' => ['department-manager'], 'manager_id' => null, 'gender' => 'Male', 'country' => 'MA', 'location' => 'Casablanca', 'joined_at' => '2020-06-15'],
            ['id' => 1045, 'first_name' => 'Maya', 'last_name' => 'El Amrani', 'job_title' => 'Sales Manager', 'department_id' => 'sales', 'email' => 'maya.elamrani@intillj.com', 'roles' => ['department-manager'], 'manager_id' => null, 'gender' => 'Female', 'country' => 'MA', 'location' => 'Casablanca', 'joined_at' => '2022-01-10'],
            ['id' => 1046, 'first_name' => 'Omar', 'last_name' => 'Bennani', 'job_title' => 'Finance Manager', 'department_id' => 'finance', 'email' => 'omar.bennani@intillj.com', 'roles' => ['department-manager'], 'manager_id' => null, 'gender' => 'Male', 'country' => 'MA', 'location' => 'Casablanca', 'joined_at' => '2019-09-01'],
            ['id' => 1047, 'first_name' => 'Ahmed', 'last_name' => 'Benali', 'job_title' => 'Software Engineer', 'department_id' => 'eng', 'email' => 'ahmed.benali@intillj.com', 'roles' => ['employee'], 'manager_id' => 1043, 'gender' => 'Male', 'country' => 'MA', 'location' => 'Casablanca', 'joined_at' => '2023-05-02'],
            ['id' => 1048, 'first_name' => 'Saad', 'last_name' => 'ES-SAFRYOUY', 'job_title' => 'HR Administrator', 'department_id' => 'people', 'email' => 'saad.hr@intillj.com', 'roles' => ['hr-admin'], 'manager_id' => null, 'gender' => 'Male', 'country' => 'MA', 'location' => 'Casablanca', 'joined_at' => '2024-02-01'],
        ];
        $password = 'TestPassword2026!'; // demo password from the API contract §2
        foreach ($people as $p) {
            $employee = Employee::updateOrCreate(['id' => $p['id']], [
                'first_name' => $p['first_name'], 'last_name' => $p['last_name'],
                'job_title' => $p['job_title'], 'department_id' => $p['department_id'],
                'email' => $p['email'], 'manager_id' => $p['manager_id'],
                'gender' => $p['gender'], 'country' => $p['country'],
                'location' => $p['location'], 'joined_at' => $p['joined_at'],
                'employment_type' => 'Full-time', 'status' => 'Active',
                'nationality_id' => 1, 'tenant_id' => $tenant->id,
            ]);
            $user = User::updateOrCreate(['email' => $p['email']], [
                'name' => $p['first_name'].' '.$p['last_name'],
                'password' => Hash::make($password),
                'roles' => $p['roles'],
                'employee_id' => $employee->id,
            ]);
            $assignTenantToUser($user);
            $employee->update(['user_id' => $user->id]);
        }

        // Department heads.
        Department::where('id', 'eng')->update(['manager_id' => 1043]);
        Department::where('id', 'ops')->update(['manager_id' => 1044]);
        Department::where('id', 'sales')->update(['manager_id' => 1045]);
        Department::where('id', 'finance')->update(['manager_id' => 1046]);
        Department::where('id', 'people')->update(['manager_id' => 1048]);

        // Demo API accounts from the contract. The demo employee is linked to
        // Ahmed Benali (1047) so the employee portal works for it: without a
        // linked employee record, GET /employees/summary 404s on every
        // employee-portal page load (the demo HR/manager accounts never call
        // it — they are role-gated out of the employee portal).
        foreach ([
            ['email' => 'demo.hr.admin@intelligence-rh.example.test', 'name' => 'Demo HR Admin', 'roles' => ['hr-admin'], 'employee_id' => null],
            ['email' => 'demo.manager.01@intelligence-rh.example.test', 'name' => 'Demo Manager', 'roles' => ['manager'], 'employee_id' => null],
            ['email' => 'demo.employee.01@intelligence-rh.example.test', 'name' => 'Demo Employee', 'roles' => ['employee'], 'employee_id' => 1047],
        ] as $demo) {
            $demoUser = User::updateOrCreate(['email' => $demo['email']], [
                'name' => $demo['name'],
                'password' => Hash::make($password),
                'roles' => $demo['roles'],
                'employee_id' => $demo['employee_id'],
            ]);
            $assignTenantToUser($demoUser);
        }

        // Super-admin from env (only when ADMIN_EMAIL/ADMIN_PASSWORD are set).
        if (env('ADMIN_EMAIL') && env('ADMIN_PASSWORD')) {
            $admin = User::updateOrCreate(['email' => env('ADMIN_EMAIL')], [
                'name' => 'Super Admin',
                'password' => Hash::make(env('ADMIN_PASSWORD')),
                'roles' => ['super-admin'],
            ]);
            $assignTenantToUser($admin);
        }

        // Safety sweep: any row that still has no tenant (created by a
        // path that missed the assignment above) joins the seed tenant.
        User::whereNull('tenant_id')->update(['tenant_id' => $tenant->id]);
        Employee::whereNull('tenant_id')->update(['tenant_id' => $tenant->id]);
        Department::whereNull('tenant_id')->update(['tenant_id' => $tenant->id]);
        \App\Models\AuditLog::whereNull('tenant_id')->update(['tenant_id' => $tenant->id]);

        // --- Leave entitlements (annual 25 / sick 12 / unpaid 30) ---
        foreach (Employee::all() as $employee) {
            foreach (['annual' => 25, 'sick' => 12, 'unpaid' => 30] as $type => $days) {
                LeaveEntitlement::updateOrCreate(
                    ['employee_id' => $employee->id, 'leave_type_id' => $type],
                    ['entitlement' => $days]
                );
            }
        }

        // --- Holidays ---
        foreach ([
            ['name' => 'Prophet Birthday', 'name_key' => 'holiday.prophetBirthday', 'date' => '2026-08-26', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA', 'site' => null],
            ['name' => 'Green March', 'name_key' => 'holiday.greenMarch', 'date' => '2026-11-06', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA', 'site' => null],
            ['name' => 'Agency Day', 'name_key' => 'holiday.agencyDay', 'date' => '2026-12-14', 'days' => 1, 'recurring' => true, 'type' => 'Company', 'country' => null, 'site' => null],
            ['name' => 'Bastille Day', 'name_key' => 'holiday.bastilleDay', 'date' => '2026-07-14', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'FR', 'site' => 'Paris'],
            ['name' => 'Throne Day', 'name_key' => 'holiday.throneDay', 'date' => '2026-07-30', 'days' => 1, 'recurring' => true, 'type' => 'Public', 'country' => 'MA', 'site' => null],
        ] as $h) {
            Holiday::updateOrCreate(['name' => $h['name'], 'date' => $h['date']], $h);
        }

        // --- Recruitment ---
        $supportJob = Job::updateOrCreate(
            ['title' => 'IT Support Technician'],
            ['department_id' => 'eng', 'description' => 'First and second line IT support for internal users: accounts, workstations, tickets and peripherals.', 'location' => 'Casablanca', 'employment_type' => 'Full-time', 'status' => 'open']
        );
        $hrJob = Job::updateOrCreate(
            ['title' => 'HR Assistant'],
            ['department_id' => 'people', 'description' => 'Support the HR team with onboarding, leave administration and employee records.', 'location' => 'Casablanca', 'employment_type' => 'Full-time', 'status' => 'open']
        );
        Job::updateOrCreate(
            ['title' => 'Warehouse Operator'],
            ['department_id' => 'ops', 'description' => 'Picking, packing and stock control in the Casablanca warehouse.', 'location' => 'Casablanca', 'employment_type' => 'Full-time', 'status' => 'closed']
        );
        $yassine = Candidate::updateOrCreate(
            ['email' => 'yassine.elfassi@example.com'],
            ['name' => 'Yassine El Fassi', 'phone' => '+212600111222']
        );
        $sara = Candidate::updateOrCreate(
            ['email' => 'sara.idrissi@example.com'],
            ['name' => 'Sara Idrissi', 'phone' => '+212600333444']
        );
        $omar = Candidate::updateOrCreate(
            ['email' => 'omar.tazi@example.com'],
            ['name' => 'Omar Tazi', 'phone' => '+212600555666']
        );
        $yassineApp = JobApplication::updateOrCreate(
            ['job_id' => $supportJob->id, 'candidate_id' => $yassine->id],
            ['stage' => 'interview', 'notes' => 'Strong ServiceNow experience.']
        );
        JobApplication::updateOrCreate(
            ['job_id' => $supportJob->id, 'candidate_id' => $sara->id],
            ['stage' => 'screening', 'notes' => 'CV review in progress.']
        );
        JobApplication::updateOrCreate(
            ['job_id' => $hrJob->id, 'candidate_id' => $omar->id],
            ['stage' => 'applied', 'notes' => null]
        );
        Interview::updateOrCreate(
            ['application_id' => $yassineApp->id, 'scheduled_at' => '2026-11-26 10:00:00'],
            ['interviewer' => 'Nadia Rahmani', 'notes' => 'Technical interview.', 'outcome' => 'pending']
        );

        // --- Performance ---
        $annual = ReviewCycle::updateOrCreate(
            ['title' => '2026 Annual Review'],
            ['period_start' => '2026-01-01', 'period_end' => '2026-12-31', 'status' => 'active']
        );
        ReviewCycle::updateOrCreate(
            ['title' => 'H2 2026 Mid-Year Review'],
            ['period_start' => '2026-07-01', 'period_end' => '2026-12-31', 'status' => 'draft']
        );
        PerformanceReview::updateOrCreate(
            ['employee_id' => 1047, 'cycle_id' => $annual->id],
            ['reviewer_id' => 1043, 'rating' => 4, 'strengths' => 'Strong technical delivery and reliability.',
             'improvements' => 'Take more ownership of code reviews.', 'feedback' => 'Solid year, keep growing into senior scope.', 'status' => 'submitted']
        );
        PerformanceReview::updateOrCreate(
            ['employee_id' => 1043, 'cycle_id' => $annual->id],
            ['reviewer_id' => 1048, 'rating' => 5, 'strengths' => 'Excellent team leadership.',
             'improvements' => 'Delegate more.', 'feedback' => 'Outstanding.', 'status' => 'draft']
        );
        foreach ([
            ['employee_id' => 1047, 'title' => 'Complete Spring Boot certification', 'description' => 'Pass the Spring Professional certification.', 'target_date' => '2026-12-31', 'status' => 'in_progress', 'progress' => 60],
            ['employee_id' => 1043, 'title' => 'Reduce onboarding time by 20%', 'description' => 'Streamline the onboarding checklist and handover.', 'target_date' => '2026-12-31', 'status' => 'in_progress', 'progress' => 40],
            ['employee_id' => 1044, 'title' => 'Implement new WMS process', 'description' => 'Roll out the new warehouse management process.', 'target_date' => '2027-03-31', 'status' => 'not_started', 'progress' => 0],
        ] as $goal) {
            Goal::updateOrCreate(['employee_id' => $goal['employee_id'], 'title' => $goal['title']], $goal);
        }

        // --- Attendance (past 5 working days before the 2026-11-24 seed date) ---
        // Times are fixed per employee so the seed is deterministic.
        $attendanceSeed = [
            1043 => ['in' => '08:50', 'out' => '17:45'],
            1044 => ['in' => '08:55', 'out' => '18:00'],
            1045 => ['in' => '09:05', 'out' => '17:30'],
            1046 => ['in' => '08:40', 'out' => '17:35'],
            1047 => ['in' => '09:00', 'out' => '17:50'],
            1048 => ['in' => '08:45', 'out' => '17:40'],
        ];
        foreach (['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23'] as $day) {
            foreach ($attendanceSeed as $empId => $times) {
                $in = $times['in'];
                $out = $times['out'];
                $status = 'present';
                $notes = null;
                if ($empId === 1044 && $day === '2026-11-20') {
                    $in = '09:45';
                    $status = 'late';
                    $notes = 'Late arrival.';
                }
                if ($empId === 1045 && $day === '2026-11-19') {
                    $in = null;
                    $out = null;
                    $status = 'absent';
                    $notes = 'Absent, no notice.';
                }
                $hours = ($in && $out)
                    ? round((strtotime($out) - strtotime($in)) / 3600, 2)
                    : null;
                AttendanceRecord::updateOrCreate(
                    ['employee_id' => $empId, 'date' => $day],
                    [
                        'check_in' => $in, 'check_out' => $out, 'status' => $status,
                        'hours_worked' => $hours, 'validated' => ! ($empId === 1047 && $day === '2026-11-23'),
                        'notes' => $notes,
                    ]
                );
            }
        }

        // --- Training ---
        foreach ([
            ['title' => 'Leadership Essentials', 'description' => 'Core leadership skills for current and future managers: feedback, delegation and team motivation.', 'category' => 'Leadership', 'duration_hours' => 16, 'provider' => 'IntelligenceHR Academy', 'status' => 'active'],
            ['title' => 'Advanced Excel for HR', 'description' => 'Pivot tables, formulas and dashboards for HR reporting.', 'category' => 'Data & Tools', 'duration_hours' => 8, 'provider' => 'IntelligenceHR Academy', 'status' => 'active'],
            ['title' => 'Effective Communication', 'description' => 'Clear, assertive communication with colleagues and candidates.', 'category' => 'Soft Skills', 'duration_hours' => 6, 'provider' => 'PeopleWorks', 'status' => 'active'],
            ['title' => 'GDPR & Data Protection', 'description' => 'Handling employee data lawfully (Moroccan law 09-08 and GDPR basics).', 'category' => 'Compliance', 'duration_hours' => 5, 'provider' => 'SafeCo', 'status' => 'archived'],
        ] as $course) {
            TrainingCourse::updateOrCreate(['title' => $course['title']], $course);
        }
        $courseIds = TrainingCourse::pluck('id', 'title')->all();
        foreach ([
            ['employee_id' => 1047, 'course' => 'Leadership Essentials', 'status' => 'in_progress', 'progress' => 40, 'completed_at' => null],
            ['employee_id' => 1043, 'course' => 'Advanced Excel for HR', 'status' => 'completed', 'progress' => 100, 'completed_at' => '2026-10-15'],
            ['employee_id' => 1044, 'course' => 'Effective Communication', 'status' => 'enrolled', 'progress' => 0, 'completed_at' => null],
            ['employee_id' => 1045, 'course' => 'GDPR & Data Protection', 'status' => 'completed', 'progress' => 100, 'completed_at' => '2026-09-20'],
            ['employee_id' => 1048, 'course' => 'Leadership Essentials', 'status' => 'enrolled', 'progress' => 0, 'completed_at' => null],
        ] as $enr) {
            TrainingEnrollment::updateOrCreate(
                ['employee_id' => $enr['employee_id'], 'course_id' => $courseIds[$enr['course']]],
                ['status' => $enr['status'], 'progress' => $enr['progress'], 'completed_at' => $enr['completed_at']]
            );
        }

        // --- Workflow templates (one published v1 each) ---
        $templates = [
            [
                'key' => 'leave-approval', 'module' => 'leave', 'resource_type' => 'leave_request', 'name' => 'Leave approval',
                'steps' => [
                    ['key' => 'manager-approval', 'sequence' => 1, 'group_key' => 'manager', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                ],
            ],
            [
                'key' => 'onboarding-validation', 'module' => 'onboarding', 'resource_type' => 'onboarding_case', 'name' => 'Onboarding validation',
                'steps' => [
                    ['key' => 'hr-validation', 'sequence' => 1, 'group_key' => 'hr', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                    ['key' => 'manager-approval', 'sequence' => 2, 'group_key' => 'manager', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                    ['key' => 'local-it', 'sequence' => 3, 'group_key' => 'local-it', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                    ['key' => 'isd', 'sequence' => 4, 'group_key' => 'isd', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                ],
            ],
            [
                'key' => 'offboarding-validation', 'module' => 'offboarding', 'resource_type' => 'offboarding_case', 'name' => 'Offboarding validation',
                'steps' => [
                    ['key' => 'hr-validation', 'sequence' => 1, 'group_key' => 'hr', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                    ['key' => 'manager-approval', 'sequence' => 2, 'group_key' => 'manager', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                    ['key' => 'local-it', 'sequence' => 3, 'group_key' => 'local-it', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                    ['key' => 'isd', 'sequence' => 4, 'group_key' => 'isd', 'mode' => 'sequential', 'completion_rule' => 'all', 'quorum' => null, 'status' => 'pending', 'assignments' => []],
                ],
            ],
        ];
        foreach ($templates as $t) {
            $template = WorkflowTemplate::updateOrCreate(['key' => $t['key']], [
                'module' => $t['module'], 'resource_type' => $t['resource_type'],
                'name' => $t['name'], 'is_active' => true,
            ]);
            WorkflowTemplateVersion::updateOrCreate(
                ['workflow_template_id' => $template->id, 'version_number' => 1],
                ['status' => 'published', 'steps' => $t['steps'], 'published_at' => now()]
            );
        }

        // --- A little live data so the dashboard is not empty ---
        $admin = User::where('email', 'saad.hr@intillj.com')->first();
        $leave = LeaveRequest::updateOrCreate(
            ['employee_id' => 1047, 'start_date' => '2026-11-24', 'end_date' => '2026-11-25'],
            ['leave_type_id' => 'annual', 'from_half' => 'full', 'to_half' => 'full',
             'duration' => 2, 'note' => 'Seeded example leave.', 'status' => 'pending',
             'submitted_at' => now()]
        );
        $case = OnboardingCase::updateOrCreate(
            ['employee_id' => 1047],
            ['employee_name' => 'Ahmed Benali', 'position' => 'Software Engineer',
             'department' => 'Engineering', 'start_date' => '2023-05-02',
             'stage' => 'Manager Approval', 'assignee' => 'Nadia Rahmani',
             'progress' => 40, 'status' => 'On track']
        );
        foreach ([
            ['label_key' => 'taskWelcomePack', 'done' => true, 'employee_visible' => true],
            ['label_key' => 'taskCompleteProfile', 'done' => true, 'employee_visible' => true],
            ['label_key' => 'taskLaptopAck', 'done' => false, 'employee_visible' => true],
            ['label_key' => 'taskSecurityBriefing', 'done' => false, 'employee_visible' => true],
        ] as $task) {
            OnboardingTask::updateOrCreate(
                ['onboarding_case_id' => $case->id, 'label_key' => $task['label_key']],
                $task
            );
        }
        if ($admin) {
            Notification::updateOrCreate(
                ['user_id' => $admin->id, 'title' => 'Welcome to IntelligenceHR', 'type' => 'info'],
                ['body' => 'Your HR workspace is ready.', 'resource_type' => null, 'resource_id' => null]
            );
        }
    }
}
