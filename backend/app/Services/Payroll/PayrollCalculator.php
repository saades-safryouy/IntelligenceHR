<?php

namespace App\Services\Payroll;

/**
 * Pure payroll calculation core (BRD §5.2, §8.3).
 *
 * No HTTP, no Eloquent, no database inside this class: it takes plain
 * arrays + a ParameterSet + a jurisdiction adapter and returns the
 * calculation_json structure (§7.8). All country-specific behaviour
 * lives in the adapter; all numbers live in the parameter set.
 *
 * Rounding (decision D-04): round half-up to 0.01 at each line. No
 * rate, bracket, ceiling or cap literal appears in this file — the
 * only numeric literals are structural (0/1 bounds, the 2-decimal
 * rounding precision, and the digits of the YYYY-MM pattern) — see
 * BRD §11.1 rule 1.
 *
 * The core never clamps the net at 0: a negative net is a validation
 * failure of the run (FR-22), not a calculation error.
 */
final class PayrollCalculator
{
    public const ENGINE_VERSION = '1.0.0';

    public function __construct(
        private readonly JurisdictionAdapterInterface $adapter,
    ) {}

    /**
     * @param array $inputs tenant_id, period (YYYY-MM), employee [id,
     *   cnss_number, category, hired_at, dependants], base_salary,
     *   lines [{component, amount}], overtime [normal_hours,
     *   night_hours, holiday_hours, hourly_rate], deductions [{type,
     *   amount}], versions [parameter_set_id, client_config_version,
     *   component_catalog_version].
     * @param array $componentCatalog the tenant's catalog rows
     *   (FR-11): [{code, category, cnss_subject, ir_subject, cap_type,
     *   cap_value, counts_toward_tax_abatement}]. A line whose component
     *   is not in the catalog is treated as fully taxable and fully
     *   contributory and flagged in warnings (FR-16).
     * @param array $clientConfig the tenant's client configuration (§4),
     *   currently carried through to the snapshot; the core reads no
     *   numbers from it in P1.
     */
    public function calculate(array $inputs, array $componentCatalog, array $clientConfig, ParameterSet $parameters): array
    {
        $this->validateInputs($inputs);

        $period = $inputs['period'];
        $employee = $inputs['employee'];
        $dependants = (int) ($employee['dependants'] ?? 0);
        $baseSalary = $this->roundMoney((float) $inputs['base_salary']);
        $versions = $inputs['versions'] ?? [];
        $warnings = [];

        // Resolve every input line against the catalog (FR-16).
        $resolvedLines = [];
        foreach ($inputs['lines'] ?? [] as $line) {
            $component = $this->resolveComponent((string) ($line['component'] ?? ''), $componentCatalog, $warnings);
            $resolvedLines[] = [
                'component' => $component['code'],
                'category' => $component['category'] ?? null,
                'amount' => $this->roundMoney((float) ($line['amount'] ?? 0)),
                'cnss_subject' => $component['cnss_subject'] ?? true,
                'ir_subject' => $component['ir_subject'] ?? true,
                'cap_type' => $component['cap_type'] ?? 'none',
                'cap_value' => $component['cap_value'] ?? null,
                'counts_toward_tax_abatement' => $component['counts_toward_tax_abatement'] ?? false,
            ];
        }

        // Overtime is computed by the adapter (uplifts are jurisdiction
        // rules) and then treated as an ordinary gross line.
        $overtimeAmount = $this->roundMoney(
            $this->adapter->overtimeAmount($inputs['overtime'] ?? [], $parameters)
        );
        if ($overtimeAmount > 0) {
            $resolvedLines[] = [
                'component' => 'overtime',
                'category' => 'earning',
                'amount' => $overtimeAmount,
                'cnss_subject' => true,
                'ir_subject' => true,
                'cap_type' => 'none',
                'cap_value' => null,
                'counts_toward_tax_abatement' => false,
            ];
        }

        // 1. GROSS = base + Σ components (cash amounts as paid).
        $gross = $baseSalary;
        foreach ($resolvedLines as $line) {
            $gross = $this->roundMoney($gross + $line['amount']);
        }

        // 2. SOCIAL BASE(S) = gross − profile.social_exemptions.
        // 4. TAXABLE INCOME base = gross − profile.tax_exemptions.
        // Both exemption tables are applied independently (FR-12).
        $socialBase = $gross;
        $taxBase = $gross;
        foreach ($resolvedLines as $i => $line) {
            $exemptCnss = $this->clampExemption(
                $this->adapter->socialExemption($line, $line['amount'], $parameters),
                $line['amount']
            );
            $exemptIr = $this->clampExemption(
                $this->adapter->taxExemption($line, $line['amount'], $parameters),
                $line['amount']
            );
            $resolvedLines[$i]['exempt_cnss'] = $exemptCnss;
            $resolvedLines[$i]['exempt_ir'] = $exemptIr;
            $socialBase = $this->roundMoney($socialBase - $exemptCnss);
            $taxBase = $this->roundMoney($taxBase - $exemptIr);
        }

        // 3. SOCIAL CONTRIBUTIONS = branches applied to their bases
        // (each branch: employee rate, employer rate, ceiling).
        $employeeBranches = [];
        $employerBranches = [];
        $employeeContributions = 0.0;
        $employerContributions = 0.0;
        foreach ($this->adapter->contributionBranches($parameters) as $branch) {
            $base = $socialBase;
            $ceiling = $branch['ceiling'] ?? null;
            if ($ceiling !== null) {
                $base = min($base, (float) $ceiling);
            }
            $base = $this->roundMoney($base);
            $emp = $this->roundMoney($base * (float) $branch['employee_rate']);
            $er = $this->roundMoney($base * (float) $branch['employer_rate']);
            $employeeBranches[$branch['key']] = $emp;
            $employerBranches[$branch['key']] = $er;
            $employeeContributions = $this->roundMoney($employeeContributions + $emp);
            $employerContributions = $this->roundMoney($employerContributions + $er);
        }

        // 5. TAX ABATEMENTS + 6. TAX — both delegated to the adapter,
        // which owns the country's taxable-income and tax computation.
        $context = [
            'dependants' => $dependants,
            'period' => $period,
            'base_salary' => $baseSalary,
        ];
        $taxable = $this->adapter->taxableIncome($taxBase, $employeeContributions, $context, $parameters);
        $taxableIncome = $this->roundMoney((float) ($taxable['taxable_income'] ?? 0));
        $abatements = [];
        foreach ($taxable['abatements'] ?? [] as $ab) {
            $abatements[] = [
                'key' => $ab['key'] ?? 'abatement',
                'amount' => $this->roundMoney((float) ($ab['amount'] ?? 0)),
            ];
        }
        $taxResult = $this->adapter->computeTax($taxableIncome, $context, $parameters);
        $tax = $this->roundMoney((float) ($taxResult['tax'] ?? 0));

        // Other deductions (advances, seizures, loans) are post-tax.
        $deductions = [];
        $deductionsTotal = 0.0;
        foreach ($inputs['deductions'] ?? [] as $deduction) {
            $amount = $this->roundMoney((float) ($deduction['amount'] ?? 0));
            $deductions[] = ['type' => $deduction['type'] ?? 'deduction', 'amount' => $amount];
            $deductionsTotal = $this->roundMoney($deductionsTotal + $amount);
        }

        // 7. NET = gross − employee social − tax − other deductions.
        $net = $this->roundMoney($gross - $employeeContributions - $tax - $deductionsTotal);

        // 8. EMPLOYER COST = gross + employer social contributions.
        $employerCost = $this->roundMoney($gross + $employerContributions);

        return [
            'engine_version' => self::ENGINE_VERSION,
            'tenant_id' => $inputs['tenant_id'] ?? null,
            'jurisdiction' => [
                'code' => $this->adapter->code(),
                'profile_version' => $this->adapter->profileVersion(),
            ],
            'parameter_set' => [
                'id' => $parameters->id,
                'valid_from' => $parameters->validFrom,
            ],
            'client_config_version' => $versions['client_config_version'] ?? null,
            'component_catalog_version' => $versions['component_catalog_version'] ?? null,
            'period' => $period,
            'employee' => [
                'id' => $employee['id'] ?? null,
                'cnss_number' => $employee['cnss_number'] ?? null,
                'category' => $employee['category'] ?? null,
                'hired_at' => $employee['hired_at'] ?? null,
            ],
            'inputs' => [
                'base_salary' => $baseSalary,
                'dependants' => $dependants,
                'overtime' => $inputs['overtime'] ?? [],
                'lines' => $resolvedLines,
            ],
            'computation' => [
                'gross' => $gross,
                'social_base' => $socialBase,
                'tax_base' => $taxBase,
                'contributions' => [
                    'employee' => ['by_branch' => $employeeBranches, 'total' => $employeeContributions],
                    'employer' => ['by_branch' => $employerBranches, 'total' => $employerContributions],
                ],
                'taxable_income' => [
                    'sbi' => $this->roundMoney((float) ($taxable['sbi'] ?? $taxBase)),
                    'abatements' => $abatements,
                    'net_taxable' => $taxableIncome,
                ],
                'tax' => [
                    'amount' => $tax,
                    'details' => $taxResult['details'] ?? [],
                ],
                'deductions' => $deductions,
                'deductions_total' => $deductionsTotal,
                'net' => $net,
                'employer_cost' => $employerCost,
            ],
            // Year-to-date cumulations need run history; P1 has none yet
            // (filled from previous payslips in P3).
            'ytd' => ['gross' => 0.0, 'cnss_employee' => 0.0, 'ir' => 0.0],
            // Additive to the §7.8 shape: FR-16 flags live here.
            'warnings' => $warnings,
        ];
    }

    /**
     * Resolve a line's component code against the catalog. An unknown
     * component (FR-16) is fully taxable and fully contributory and is
     * flagged — never silently exempted.
     */
    private function resolveComponent(string $code, array $catalog, array &$warnings): array
    {
        foreach ($catalog as $component) {
            if (($component['code'] ?? null) === $code) {
                return $component;
            }
        }

        $warnings[] = ['code' => 'unknown_component', 'component' => $code];

        return [
            'code' => $code,
            'category' => null,
            'cnss_subject' => true,
            'ir_subject' => true,
            'cap_type' => 'none',
            'cap_value' => null,
            'counts_toward_tax_abatement' => false,
        ];
    }

    private function clampExemption(float $exempt, float $amount): float
    {
        return $this->roundMoney(min(max($exempt, 0.0), $amount));
    }

    /** Decision D-04: round half-up to 0.01 at each line. */
    private function roundMoney(float $value): float
    {
        return round($value, 2, PHP_ROUND_HALF_UP);
    }

    private function validateInputs(array $inputs): void
    {
        if (! isset($inputs['period']) || ! preg_match('/^\d{4}-\d{2}$/', (string) $inputs['period'])) {
            throw new \InvalidArgumentException('Payroll inputs require a period in YYYY-MM format.');
        }
        if (! isset($inputs['employee']['id'])) {
            throw new \InvalidArgumentException('Payroll inputs require employee.id.');
        }
        if (! is_numeric($inputs['base_salary'] ?? null) || (float) $inputs['base_salary'] < 0) {
            throw new \InvalidArgumentException('Payroll inputs require a non-negative base_salary.');
        }
        if ((int) ($inputs['employee']['dependants'] ?? 0) < 0) {
            throw new \InvalidArgumentException('Payroll inputs require a non-negative dependants count.');
        }
    }
}
