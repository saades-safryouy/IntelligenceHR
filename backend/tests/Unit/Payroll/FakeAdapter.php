<?php

namespace Tests\Unit\Payroll;

use App\Services\Payroll\JurisdictionAdapterInterface;
use App\Services\Payroll\ParameterSet;

/**
 * Test-only jurisdiction adapter (BRD §8.3): proves the core computes
 * correctly independent of any real jurisdiction. Every number comes
 * from the ParameterSet the test supplies — the adapter contains no
 * literal rates (only 0, 1, 12 and 100 per §11.1 rule 1).
 *
 * Fake scheme (monthly, deliberately simple):
 * - One contribution branch ("fake-branch") with employee/employer
 *   rates and an optional ceiling from the parameter set.
 * - Taxable income = (gross − tax exemptions) − employee
 *   contributions − abatement, where abatement =
 *   min(taxable × rate, cap).
 * - Tax = max(0, taxable − threshold) × rate − dependants ×
 *   family_per_person, floored at 0.
 * - Components flagged cnss_subject / ir_subject false are fully
 *   exempt; cap_type "fixed_period" exempts up to cap_value.
 */
final class FakeAdapter implements JurisdictionAdapterInterface
{
    public function code(): string
    {
        return 'FAKE';
    }

    public function profileVersion(): string
    {
        return '1.0';
    }

    public function socialExemption(array $component, float $amount, ParameterSet $params): float
    {
        // Subject to contributions: no exemption, whatever the cap says.
        // A cap limits an exemption; it never creates one.
        if (($component['cnss_subject'] ?? true) === true) {
            return 0.0;
        }

        return $this->cappedExemption($component, $amount);
    }

    public function taxExemption(array $component, float $amount, ParameterSet $params): float
    {
        if (($component['ir_subject'] ?? true) === true) {
            return 0.0;
        }

        return $this->cappedExemption($component, $amount);
    }

    private function cappedExemption(array $component, float $amount): float
    {
        $capType = $component['cap_type'] ?? 'none';
        if ($capType === 'none' || $capType === null) {
            return $amount;
        }
        if ($capType === 'fixed_period') {
            return min($amount, (float) ($component['cap_value'] ?? 0));
        }

        // The fake profile only understands fixed-period caps: an
        // exempt component with an unknown cap type is fully exempt.
        return $amount;
    }

    public function contributionBranches(ParameterSet $params): array
    {
        $ceiling = $params->getFloat('fake.branch.ceiling');

        return [[
            'key' => 'fake-branch',
            'employee_rate' => $params->getFloat('fake.branch.employee_rate'),
            'employer_rate' => $params->getFloat('fake.branch.employer_rate'),
            'ceiling' => $ceiling > 0 ? $ceiling : null,
        ]];
    }

    public function overtimeAmount(array $overtime, ParameterSet $params): float
    {
        $normal = (float) ($overtime['normal_hours'] ?? 0);
        $night = (float) ($overtime['night_hours'] ?? 0);
        $holiday = (float) ($overtime['holiday_hours'] ?? 0);
        $rate = (float) ($overtime['hourly_rate'] ?? 0);
        if ($normal + $night + $holiday <= 0 || $rate <= 0) {
            return 0.0; // No overtime: no uplift parameters are needed.
        }

        return $normal * $rate * $params->getFloat('fake.overtime.uplift_normal')
            + $night * $rate * $params->getFloat('fake.overtime.uplift_night')
            + $holiday * $rate * $params->getFloat('fake.overtime.uplift_holiday');
    }

    public function taxableIncome(float $taxBase, float $employeeContributions, array $context, ParameterSet $params): array
    {
        $sbi = $taxBase - $employeeContributions;
        $abatement = min($sbi * $params->getFloat('fake.abatement.rate'), $params->getFloat('fake.abatement.cap'));
        $abatement = max($abatement, 0.0);

        return [
            'taxable_income' => $sbi - $abatement,
            'sbi' => $sbi,
            'abatements' => [['key' => 'fake-abatement', 'amount' => $abatement]],
        ];
    }

    public function computeTax(float $netTaxable, array $context, ParameterSet $params): array
    {
        $threshold = $params->getFloat('fake.tax.threshold');
        $taxable = max($netTaxable - $threshold, 0.0);
        $grossTax = $taxable * $params->getFloat('fake.tax.rate');
        $reduction = (int) ($context['dependants'] ?? 0) * $params->getFloat('fake.tax.family_per_person');
        $tax = max($grossTax - $reduction, 0.0);

        return [
            'tax' => $tax,
            'details' => [
                'threshold' => $threshold,
                'rate' => $params->getFloat('fake.tax.rate'),
                'gross_tax' => $grossTax,
                'family_reduction' => $reduction,
            ],
        ];
    }

    public function minimumWage(ParameterSet $params): ?float
    {
        return $params->has('fake.minimum_wage_hourly')
            ? $params->getFloat('fake.minimum_wage_hourly')
            : null;
    }

    public function mandatoryPayslipMentions(): array
    {
        return ['employee_name', 'gross', 'net'];
    }

    public function validationChecks(array $runContext): array
    {
        return [];
    }

    public function reportingPack(): array
    {
        return [];
    }
}
