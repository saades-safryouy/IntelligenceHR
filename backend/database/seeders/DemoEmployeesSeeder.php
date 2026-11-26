<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\LeaveEntitlement;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * 44 extra demo employees (6 existing + 44 = 50 total) so the
 * dashboard, people directory and Reports charts test against a
 * realistic headcount instead of 6 rows.
 *
 * Deterministic: fixed name/date lists, no randomness — every seed
 * produces the same 50 employees. Data-only records: no login User
 * accounts, no payroll structures, no CNSS numbers, no dependants
 * (PayrollDemoSeeder still covers only ids 1043–1048, by hardcoded
 * id list, so it never touches these rows).
 *
 * - Emails are unique, in the demo domain
 *   firstname.lastname@intelligence-rh.example.test.
 * - Gender: 22 male / 22 female. Departments: eng 14, ops 10,
 *   sales 9, finance 6, people 5. Status: 41 Active, 3 On Leave.
 * - joined_at spread 2019–2026 (2019:4, 2020:5, 2021:8, 2022:6,
 *   2023:7, 2024:6, 2025:5, 2026:3) so the hires/tenure charts
 *   have real shape; with the original 6 the totals per year are
 *   2019:5, 2020:6, 2021:9, 2022:7, 2023:8, 2024:7, 2025:5, 2026:3.
 * - Each employee reports to their department manager
 *   (eng 1043, ops 1044, sales 1045, finance 1046, people 1048).
 * - Leave entitlements use the same defaults as DatabaseSeeder
 *   (annual 25 / sick 12 / unpaid 30).
 *
 * Idempotent: firstOrCreate keyed on the unique email, so re-running
 * the seeder on every deploy never duplicates anyone and never
 * overwrites HR edits.
 */
class DemoEmployeesSeeder extends Seeder
{
    /**
     * The 44 demo-employee rows. Public static so the data lists can
     * be checked by a pure unit test without booting the app or a DB.
     *
     * @return array<int, array{first_name: string, last_name: string, email: string, gender: string, department_id: string, job_title: string, joined_at: string, status: string}>
     */
    public static function people(): array
    {
        return [
            // --- Engineering (14) ---
            ['first_name' => 'Youssef', 'last_name' => 'El Fassi', 'email' => 'youssef.elfassi@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'Software Engineer', 'joined_at' => '2019-04-15', 'status' => 'Active'],
            ['first_name' => 'Salma', 'last_name' => 'Berrada', 'email' => 'salma.berrada@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'Frontend Developer', 'joined_at' => '2019-09-02', 'status' => 'On Leave'],
            ['first_name' => 'Omar', 'last_name' => 'El Idrissi', 'email' => 'omar.elidrissi@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'Backend Developer', 'joined_at' => '2020-02-10', 'status' => 'Active'],
            ['first_name' => 'Sara', 'last_name' => 'Mansouri', 'email' => 'sara.mansouri@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'QA Engineer', 'joined_at' => '2020-07-20', 'status' => 'Active'],
            ['first_name' => 'Mehdi', 'last_name' => 'Alaoui', 'email' => 'mehdi.alaoui@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'DevOps Engineer', 'joined_at' => '2021-01-18', 'status' => 'Active'],
            ['first_name' => 'Lina', 'last_name' => 'Chraibi', 'email' => 'lina.chraibi@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'Software Engineer', 'joined_at' => '2021-05-24', 'status' => 'Active'],
            ['first_name' => 'Adam', 'last_name' => 'Tazi', 'email' => 'adam.tazi@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'Mobile Developer', 'joined_at' => '2021-10-04', 'status' => 'Active'],
            ['first_name' => 'Khadija', 'last_name' => 'Benjelloun', 'email' => 'khadija.benjelloun@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'Data Analyst', 'joined_at' => '2022-03-14', 'status' => 'Active'],
            ['first_name' => 'Yassine', 'last_name' => 'Bennis', 'email' => 'yassine.bennis@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'IT Support Technician', 'joined_at' => '2022-08-22', 'status' => 'Active'],
            ['first_name' => 'Nour', 'last_name' => 'Fassi', 'email' => 'nour.fassi@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'Frontend Developer', 'joined_at' => '2023-01-09', 'status' => 'Active'],
            ['first_name' => 'Anas', 'last_name' => 'Filali', 'email' => 'anas.filali@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'Backend Developer', 'joined_at' => '2023-06-12', 'status' => 'Active'],
            ['first_name' => 'Rania', 'last_name' => 'Squalli', 'email' => 'rania.squalli@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'QA Engineer', 'joined_at' => '2024-02-19', 'status' => 'Active'],
            ['first_name' => 'Zakaria', 'last_name' => 'Amrani', 'email' => 'zakaria.amrani@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'eng', 'job_title' => 'Systems Administrator', 'joined_at' => '2024-09-30', 'status' => 'Active'],
            ['first_name' => 'Hiba', 'last_name' => 'Naciri', 'email' => 'hiba.naciri@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'eng', 'job_title' => 'Data Engineer', 'joined_at' => '2025-04-07', 'status' => 'Active'],
            // --- Operations (10) ---
            ['first_name' => 'Hassan', 'last_name' => 'El Ouardi', 'email' => 'hassan.elouardi@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'ops', 'job_title' => 'Logistics Coordinator', 'joined_at' => '2019-06-03', 'status' => 'Active'],
            ['first_name' => 'Fatima Zahra', 'last_name' => 'Bennis', 'email' => 'fatimazahra.bennis@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'ops', 'job_title' => 'Warehouse Supervisor', 'joined_at' => '2020-03-16', 'status' => 'Active'],
            ['first_name' => 'Bilal', 'last_name' => 'Cherif', 'email' => 'bilal.cherif@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'ops', 'job_title' => 'Warehouse Operator', 'joined_at' => '2021-02-08', 'status' => 'Active'],
            ['first_name' => 'Amina', 'last_name' => 'Slaoui', 'email' => 'amina.slaoui@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'ops', 'job_title' => 'Operations Analyst', 'joined_at' => '2021-11-15', 'status' => 'On Leave'],
            ['first_name' => 'Rachid', 'last_name' => 'El Mouden', 'email' => 'rachid.elmouden@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'ops', 'job_title' => 'Supply Chain Planner', 'joined_at' => '2022-05-09', 'status' => 'Active'],
            ['first_name' => 'Sofia', 'last_name' => 'Benali', 'email' => 'sofia.benali@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'ops', 'job_title' => 'Inventory Controller', 'joined_at' => '2023-03-27', 'status' => 'Active'],
            ['first_name' => 'Hamza', 'last_name' => 'Tazi', 'email' => 'hamza.tazi@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'ops', 'job_title' => 'Fleet Coordinator', 'joined_at' => '2023-10-02', 'status' => 'Active'],
            ['first_name' => 'Nadia', 'last_name' => 'El Kaddouri', 'email' => 'nadia.elkaddouri@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'ops', 'job_title' => 'Procurement Officer', 'joined_at' => '2024-04-22', 'status' => 'Active'],
            ['first_name' => 'Ismail', 'last_name' => 'Kabbaj', 'email' => 'ismail.kabbaj@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'ops', 'job_title' => 'Warehouse Operator', 'joined_at' => '2025-01-13', 'status' => 'Active'],
            ['first_name' => 'Mariam', 'last_name' => 'Fikri', 'email' => 'mariam.fikri@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'ops', 'job_title' => 'Logistics Coordinator', 'joined_at' => '2026-03-02', 'status' => 'Active'],
            // --- Commercial / Sales (9) ---
            ['first_name' => 'Karim', 'last_name' => 'El Amrani', 'email' => 'karim.elamrani@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'sales', 'job_title' => 'Sales Representative', 'joined_at' => '2019-11-11', 'status' => 'Active'],
            ['first_name' => 'Laila', 'last_name' => 'Benomar', 'email' => 'laila.benomar@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'sales', 'job_title' => 'Account Manager', 'joined_at' => '2020-05-18', 'status' => 'Active'],
            ['first_name' => 'Soufiane', 'last_name' => 'Radi', 'email' => 'soufiane.radi@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'sales', 'job_title' => 'Business Development Representative', 'joined_at' => '2021-08-30', 'status' => 'Active'],
            ['first_name' => 'Imane', 'last_name' => 'El Hachimi', 'email' => 'imane.elhachimi@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'sales', 'job_title' => 'Sales Representative', 'joined_at' => '2022-02-14', 'status' => 'Active'],
            ['first_name' => 'Othmane', 'last_name' => 'Berrada', 'email' => 'othmane.berrada@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'sales', 'job_title' => 'Account Manager', 'joined_at' => '2022-12-05', 'status' => 'Active'],
            ['first_name' => 'Yasmin', 'last_name' => 'Alaoui', 'email' => 'yasmin.alaoui@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'sales', 'job_title' => 'Customer Success Manager', 'joined_at' => '2023-07-17', 'status' => 'On Leave'],
            ['first_name' => 'Walid', 'last_name' => 'Sebti', 'email' => 'walid.sebti@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'sales', 'job_title' => 'Sales Team Lead', 'joined_at' => '2024-06-24', 'status' => 'Active'],
            ['first_name' => 'Sara', 'last_name' => 'El Gueddari', 'email' => 'sara.elgueddari@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'sales', 'job_title' => 'Sales Representative', 'joined_at' => '2025-08-11', 'status' => 'Active'],
            ['first_name' => 'Mehdi', 'last_name' => 'El Mansouri', 'email' => 'mehdi.elmansouri@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'sales', 'job_title' => 'Business Development Representative', 'joined_at' => '2026-05-20', 'status' => 'Active'],
            // --- Finance (6) ---
            ['first_name' => 'Ghita', 'last_name' => 'El Bouzidi', 'email' => 'ghita.elbouzidi@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'finance', 'job_title' => 'Accountant', 'joined_at' => '2020-09-07', 'status' => 'Active'],
            ['first_name' => 'Reda', 'last_name' => 'Ouazzani', 'email' => 'reda.ouazzani@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'finance', 'job_title' => 'Senior Accountant', 'joined_at' => '2021-04-12', 'status' => 'Active'],
            ['first_name' => 'Nisrine', 'last_name' => 'Fassi', 'email' => 'nisrine.fassi@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'finance', 'job_title' => 'Financial Analyst', 'joined_at' => '2022-10-17', 'status' => 'Active'],
            ['first_name' => 'Tarik', 'last_name' => 'Benkirane', 'email' => 'tarik.benkirane@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'finance', 'job_title' => 'Payroll Officer', 'joined_at' => '2023-09-04', 'status' => 'Active'],
            ['first_name' => 'Aya', 'last_name' => 'El Mrabet', 'email' => 'aya.elmrabet@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'finance', 'job_title' => 'Accounts Payable Clerk', 'joined_at' => '2024-11-25', 'status' => 'Active'],
            ['first_name' => 'Jawad', 'last_name' => 'Choukri', 'email' => 'jawad.choukri@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'finance', 'job_title' => 'Finance Assistant', 'joined_at' => '2025-06-16', 'status' => 'Active'],
            // --- People & Culture (5) ---
            ['first_name' => 'Zineb', 'last_name' => 'El Yazidi', 'email' => 'zineb.elyazidi@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'people', 'job_title' => 'HR Officer', 'joined_at' => '2021-06-21', 'status' => 'Active'],
            ['first_name' => 'Amine', 'last_name' => 'Jebari', 'email' => 'amine.jebari@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'people', 'job_title' => 'Recruiter', 'joined_at' => '2023-02-06', 'status' => 'Active'],
            ['first_name' => 'Chaimae', 'last_name' => 'Belhaj', 'email' => 'chaimae.belhaj@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'people', 'job_title' => 'Talent Acquisition Specialist', 'joined_at' => '2024-03-11', 'status' => 'Active'],
            ['first_name' => 'Driss', 'last_name' => 'El Khatib', 'email' => 'driss.elkhatib@intelligence-rh.example.test', 'gender' => 'Male', 'department_id' => 'people', 'job_title' => 'HR Assistant', 'joined_at' => '2025-10-06', 'status' => 'Active'],
            ['first_name' => 'Loubna', 'last_name' => 'Mansouri', 'email' => 'loubna.mansouri@intelligence-rh.example.test', 'gender' => 'Female', 'department_id' => 'people', 'job_title' => 'Training Coordinator', 'joined_at' => '2026-07-13', 'status' => 'Active'],
        ];
    }

    public function run(): void
    {
        $tenant = Tenant::firstOrCreate(['slug' => 'demo-company'], [
            'name' => 'Demo Company',
            'status' => 'active',
            'default_jurisdiction' => 'MA',
            'default_currency' => 'MAD',
            'default_languages' => ['fr', 'ar'],
        ]);

        // Department managers, same ids as DatabaseSeeder.
        $managers = [
            'eng' => 1043,
            'ops' => 1044,
            'sales' => 1045,
            'finance' => 1046,
            'people' => 1048,
        ];

        foreach (self::people() as $p) {
            $employee = Employee::firstOrCreate(['email' => $p['email']], [
                'first_name' => $p['first_name'],
                'last_name' => $p['last_name'],
                'job_title' => $p['job_title'],
                'department_id' => $p['department_id'],
                'manager_id' => $managers[$p['department_id']],
                'gender' => $p['gender'],
                'country' => 'MA',
                'location' => 'Casablanca',
                'joined_at' => $p['joined_at'],
                'employment_type' => 'Full-time',
                'status' => $p['status'],
                'nationality_id' => 1,
                'tenant_id' => $tenant->id,
            ]);

            // Same leave defaults as DatabaseSeeder (annual 25 / sick 12
            // / unpaid 30). This seeder runs after that loop, so the new
            // employees need their own entitlements here.
            foreach (['annual' => 25, 'sick' => 12, 'unpaid' => 30] as $type => $days) {
                LeaveEntitlement::updateOrCreate(
                    ['employee_id' => $employee->id, 'leave_type_id' => $type],
                    ['entitlement' => $days]
                );
            }
        }
    }
}
