<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\PayrollClientConfig;
use App\Models\PayrollSalaryComponent;
use App\Models\PayrollSalaryStructure;
use App\Models\PayrollStructureLine;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * Payroll demo data for the seed tenant (BRD §13 P3 demo).
 *
 * Seeds, for the Demo Company tenant only:
 * - the structural system components (base salary, overtime) the
 *   core seeds in P3, plus the Morocco-suggested 'seniority' (D-09)
 *   and 'transport' components (the transport catalog entry mirrors
 *   the P2 adapter test: not contribution/tax-subject, so the adapter
 *   exempts it up to the statutory cap);
 * - one active salary structure per demo employee (base 10,000 DH,
 *   191 h/month, effective 2026-01-01) with a 500 DH urban transport
 *   line — demo data, clearly marked;
 * - demo CNSS numbers + dependants for the demo employees, ONLY when
 *   they are currently empty (HR edits are never overwritten). Ahmed
 *   Benali (1047) gets 2 children + a dependent spouse = 3 persons,
 *   so his payslip reproduces the BRD §6.4 worked example (2026:
 *   IR 451.56, net 9,553.64 DH);
 * - the default client configuration v1 (MAD, fr/ar, monthly,
 *   AMO partial exemption off, no seniority bands until HR
 *   configures them — the statutory seniority rule is unvalidated,
 *   V-09).
 *
 * Idempotent: firstOrCreate everywhere, so re-running the seeder on
 * every deploy never resets HR edits.
 */
class PayrollDemoSeeder extends Seeder
{
    public function run(): void
    {
        $tenant = Tenant::where('slug', 'demo-company')->first();
        if ($tenant === null) {
            return;
        }
        $tenantId = $tenant->id;

        // --- Component catalog -------------------------------------
        $components = [
            [
                'code' => 'base_salary', 'name_fr' => 'Salaire de base', 'name_ar' => 'الراتب الأساسي', 'name_en' => 'Base salary',
                'category' => 'earning', 'cnss_subject' => true, 'ir_subject' => true,
                'cap_type' => 'none', 'cap_value' => null, 'counts_toward_tax_abatement' => false,
                'is_system' => true, 'suggested_by_profile' => null,
            ],
            [
                'code' => 'overtime', 'name_fr' => 'Heures supplémentaires', 'name_ar' => 'الساعات الإضافية', 'name_en' => 'Overtime',
                'category' => 'earning', 'cnss_subject' => true, 'ir_subject' => true,
                'cap_type' => 'none', 'cap_value' => null, 'counts_toward_tax_abatement' => false,
                'is_system' => true, 'suggested_by_profile' => null,
            ],
            [
                'code' => 'seniority', 'name_fr' => 'Prime d’ancienneté', 'name_ar' => 'منحة الأقدمية', 'name_en' => 'Seniority bonus',
                'category' => 'bonus', 'cnss_subject' => true, 'ir_subject' => true,
                'cap_type' => 'none', 'cap_value' => null, 'counts_toward_tax_abatement' => false,
                'is_system' => false, 'suggested_by_profile' => 'MA:2026.1',
            ],
            [
                'code' => 'transport', 'name_fr' => 'Indemnité de transport', 'name_ar' => 'تعويض النقل', 'name_en' => 'Transport allowance',
                'category' => 'allowance', 'cnss_subject' => false, 'ir_subject' => false,
                'cap_type' => 'fixed_period', 'cap_value' => 500, 'counts_toward_tax_abatement' => false,
                'is_system' => false, 'suggested_by_profile' => 'MA:2026.1',
            ],
        ];
        $componentIds = [];
        foreach ($components as $component) {
            $row = PayrollSalaryComponent::firstOrCreate(
                ['tenant_id' => $tenantId, 'code' => $component['code']],
                array_merge($component, ['tenant_id' => $tenantId, 'active' => true, 'effective_from' => '2026-01-01'])
            );
            $componentIds[$component['code']] = $row->id;
        }

        // --- Demo employee payroll data (only when empty) ----------
        $demoPayrollData = [
            // employee_id => [cnss_number, dependants_count, spouse_dependent]
            1043 => ['1000001043', 1, true],
            1044 => ['1000001044', 2, true],
            1045 => ['1000001045', 0, false],
            1046 => ['1000001046', 3, true],
            1047 => ['1000001047', 2, true], // 3 persons: reproduces the §6.4 worked example
            1048 => ['1000001048', 0, false],
        ];
        foreach ($demoPayrollData as $employeeId => [$cnssNumber, $dependantsCount, $spouseDependent]) {
            $employee = Employee::where('tenant_id', $tenantId)->where('id', $employeeId)->first();
            if ($employee === null) {
                continue;
            }
            $updates = [];
            if (empty($employee->cnss_number)) {
                $updates['cnss_number'] = $cnssNumber;
            }
            if (empty($employee->dependants_count) && $dependantsCount > 0) {
                $updates['dependants_count'] = $dependantsCount;
            }
            if (empty($employee->spouse_dependent) && $spouseDependent) {
                $updates['spouse_dependent'] = true;
            }
            if ($updates !== []) {
                $employee->update($updates);
            }
        }

        // --- Salary structures (demo: base 10,000 DH + 500 transport)
        foreach (array_keys($demoPayrollData) as $employeeId) {
            $structure = PayrollSalaryStructure::firstOrCreate(
                ['tenant_id' => $tenantId, 'employee_id' => $employeeId, 'effective_from' => '2026-01-01'],
                [
                    'base_salary' => 10000,
                    'contractual_hours_month' => 191,
                    'employment_type' => 'Full-time',
                    'effective_to' => null,
                    'notes' => 'Demo structure (P3 seed).',
                ]
            );
            PayrollStructureLine::firstOrCreate(
                ['tenant_id' => $tenantId, 'salary_structure_id' => $structure->id, 'component_code' => 'transport'],
                [
                    'component_id' => $componentIds['transport'],
                    'amount' => 500,
                    'notes' => 'Urban transport allowance (demo).',
                ]
            );
        }

        // --- Default client configuration v1 -----------------------
        PayrollClientConfig::firstOrCreate(
            ['tenant_id' => $tenantId, 'version' => 1],
            [
                'settings_json' => [
                    'company' => [
                        'legal_name' => 'Demo Company',
                        'trade_name' => 'Demo Company',
                        'address' => null,
                        'currency' => 'MAD',
                        'languages' => ['fr', 'ar'],
                        'statutory_ids' => [
                            'cnss_affiliation_number' => null,
                            'ice' => null,
                            'if' => null,
                        ],
                        'payroll_contact' => ['name' => null, 'email' => null],
                    ],
                    'payroll' => [
                        'frequency' => 'monthly',
                        'pay_day' => null,
                        'cut_off_day' => null,
                        // §6.1 / art. 114 loi 65-00: off by default.
                        'amo_partial_exemption' => false,
                        // D-09: no bands until HR configures them
                        // (the statutory seniority rule is unvalidated, V-09).
                        'seniority_bands' => [],
                    ],
                    'approval' => [
                        'steps' => 1,
                        'separation_of_duties' => true,
                    ],
                    'branding' => [
                        'languages' => ['fr', 'ar'],
                    ],
                ],
                'effective_from' => '2026-01-01',
                'effective_to' => null,
            ]
        );
    }
}
