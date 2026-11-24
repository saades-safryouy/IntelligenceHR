<?php

namespace Tests\Unit\Payroll;

use App\Services\Payroll\MissingPayrollParameterException;
use App\Services\Payroll\ParameterSet;
use App\Services\Payroll\PayrollCalculator;
use PHPUnit\Framework\TestCase;

/**
 * Core engine tests (BRD §8.3, §12.2): the PayrollCalculator is tested
 * with the fake adapter, independently of any real jurisdiction. Every
 * expected figure below is hand-computed from the fake parameter set.
 *
 * Fake parameters (supplied by the test, never hardcoded in the core):
 * - branch: employee 5%, employer 10%, ceiling 6000
 * - abatement: 20% of taxable, capped at 1000
 * - tax: 10% above a 2000 threshold, 100 per dependant
 * - overtime uplifts: normal 1.25, night 1.50, holiday 2.00
 */
final class PayrollCalculatorTest extends TestCase
{
    private function params(array $overrides = []): ParameterSet
    {
        return new ParameterSet('FAKE', '1.0', 1, '2026-01-01', array_merge([
            'fake.branch.employee_rate' => 0.05,
            'fake.branch.employer_rate' => 0.10,
            'fake.branch.ceiling' => 6000,
            'fake.abatement.rate' => 0.20,
            'fake.abatement.cap' => 1000,
            'fake.tax.threshold' => 2000,
            'fake.tax.rate' => 0.10,
            'fake.tax.family_per_person' => 100,
            'fake.overtime.uplift_normal' => 1.25,
            'fake.overtime.uplift_night' => 1.50,
            'fake.overtime.uplift_holiday' => 2.00,
        ], $overrides));
    }

    private function inputs(array $overrides = []): array
    {
        return array_merge([
            'tenant_id' => 1,
            'period' => '2026-11',
            'employee' => ['id' => 1048, 'cnss_number' => 'CNSS-1', 'category' => 'Cadre', 'hired_at' => '2024-02-01', 'dependants' => 0],
            'base_salary' => 10000.00,
            'lines' => [],
            'overtime' => [],
            'deductions' => [],
            'versions' => ['parameter_set_id' => 1, 'client_config_version' => 1, 'component_catalog_version' => 1],
        ], $overrides);
    }

    private function calculator(): PayrollCalculator
    {
        return new PayrollCalculator(new FakeAdapter);
    }

    public function test_base_case_gross_contributions_tax_net_and_employer_cost(): void
    {
        // Gross 10000; capped base 6000 → employee 300, employer 600.
        // SBI 9700; abatement min(1940, 1000) = 1000; SNI 8700.
        // Tax (8700 − 2000) × 10% = 670. Net 9030, employer cost 10600.
        $result = $this->calculator()->calculate($this->inputs(), [], [], $this->params());

        $this->assertSame(10000.00, $result['computation']['gross']);
        $this->assertSame(300.00, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(600.00, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(8700.00, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(670.00, $result['computation']['tax']['amount']);
        $this->assertSame(9030.00, $result['computation']['net']);
        $this->assertSame(10600.00, $result['computation']['employer_cost']);
        $this->assertSame('1.0.0', $result['engine_version']);
        $this->assertSame('FAKE', $result['jurisdiction']['code']);
        $this->assertSame([], $result['warnings']);
    }

    public function test_contribution_ceiling_caps_the_branch_base(): void
    {
        // Gross 8000 but the branch base is capped at 6000.
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 8000.00]), [], [], $this->params()
        );

        $this->assertSame(300.00, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(600.00, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(7230.00, $result['computation']['net']);
    }

    public function test_tax_exemption_removes_the_component_from_the_tax_base_only(): void
    {
        // Transport 500: tax-exempt (ir_subject false), contributory
        // (cnss_subject true). Tax base 5000, social base 5500.
        $catalog = [[
            'code' => 'transport', 'category' => 'allowance',
            'cnss_subject' => true, 'ir_subject' => false,
            'cap_type' => 'fixed_period', 'cap_value' => 500,
            'counts_toward_tax_abatement' => false,
        ]];
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 5000.00, 'lines' => [['component' => 'transport', 'amount' => 500.00]]]),
            $catalog, [], $this->params()
        );

        $this->assertSame(5500.00, $result['computation']['gross']);
        $this->assertSame(5500.00, $result['computation']['social_base']);
        $this->assertSame(5000.00, $result['computation']['tax_base']);
        $this->assertSame(500.00, $result['inputs']['lines'][0]['exempt_ir']);
        $this->assertSame(0.00, $result['inputs']['lines'][0]['exempt_cnss']);
        $this->assertSame(5047.00, $result['computation']['net']);
    }

    public function test_exemption_cap_limits_the_exempt_part(): void
    {
        // Meal 500, exempt for both bases but capped at 300 per period:
        // only 300 leaves each base; the 200 excess stays in.
        $catalog = [[
            'code' => 'meal', 'category' => 'allowance',
            'cnss_subject' => false, 'ir_subject' => false,
            'cap_type' => 'fixed_period', 'cap_value' => 300,
            'counts_toward_tax_abatement' => false,
        ]];
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 5000.00, 'lines' => [['component' => 'meal', 'amount' => 500.00]]]),
            $catalog, [], $this->params()
        );

        $this->assertSame(300.00, $result['inputs']['lines'][0]['exempt_ir']);
        $this->assertSame(300.00, $result['inputs']['lines'][0]['exempt_cnss']);
        $this->assertSame(5200.00, $result['computation']['social_base']);
        $this->assertSame(5044.80, $result['computation']['net']);
    }

    public function test_family_reduction_is_deducted_from_the_tax(): void
    {
        // Same as the base case, with 3 dependants: tax 670 − 300 = 370.
        $inputs = $this->inputs();
        $inputs['employee']['dependants'] = 3;
        $result = $this->calculator()->calculate($inputs, [], [], $this->params());

        $this->assertSame(370.00, $result['computation']['tax']['amount']);
        $this->assertSame(9330.00, $result['computation']['net']);
    }

    public function test_unknown_component_is_fully_taxable_and_flagged(): void
    {
        // 'mystery' is not in the catalog (FR-16): fully in both bases,
        // and a warning names it.
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 5000.00, 'lines' => [['component' => 'mystery', 'amount' => 200.00]]]),
            [], [], $this->params()
        );

        $this->assertSame(5200.00, $result['computation']['gross']);
        $this->assertSame(5200.00, $result['computation']['social_base']);
        $this->assertSame(5200.00, $result['computation']['tax_base']);
        $this->assertSame(4744.80, $result['computation']['net']);
        $this->assertSame([['code' => 'unknown_component', 'component' => 'mystery']], $result['warnings']);
    }

    public function test_overtime_is_paid_through_the_adapter_uplifts(): void
    {
        // 10 normal hours × 50 DH × 1.25 = 625 overtime; gross 5625.
        // Employee 281.25, employer 562.50; SNI 4343.75;
        // tax (4343.75 − 2000) × 10% = 234.38; net 5109.37.
        $result = $this->calculator()->calculate(
            $this->inputs([
                'base_salary' => 5000.00,
                'overtime' => ['normal_hours' => 10, 'night_hours' => 0, 'holiday_hours' => 0, 'hourly_rate' => 50],
            ]),
            [], [], $this->params()
        );

        $this->assertSame(5625.00, $result['computation']['gross']);
        $this->assertSame(281.25, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(234.38, $result['computation']['tax']['amount']);
        $this->assertSame(5109.37, $result['computation']['net']);
        $this->assertSame(6187.50, $result['computation']['employer_cost']);
    }

    public function test_deductions_reduce_the_net_after_tax(): void
    {
        $result = $this->calculator()->calculate(
            $this->inputs(['deductions' => [['type' => 'advance', 'amount' => 500.00]]]),
            [], [], $this->params()
        );

        $this->assertSame(8530.00, $result['computation']['net']);
        $this->assertSame(500.00, $result['computation']['deductions_total']);
    }

    public function test_missing_parameter_fails_loudly_with_its_key(): void
    {
        $params = new ParameterSet('FAKE', '1.0', 1, '2026-01-01', [
            // 'fake.branch.employee_rate' deliberately absent.
            'fake.branch.employer_rate' => 0.10,
            'fake.branch.ceiling' => 6000,
            'fake.abatement.rate' => 0.20,
            'fake.abatement.cap' => 1000,
            'fake.tax.threshold' => 2000,
            'fake.tax.rate' => 0.10,
            'fake.tax.family_per_person' => 100,
        ]);

        $this->expectException(MissingPayrollParameterException::class);
        $this->expectExceptionMessage('fake.branch.employee_rate');

        $this->calculator()->calculate($this->inputs(), [], [], $params);
    }

    public function test_rounding_is_half_up_to_001_at_each_line(): void
    {
        // 2.50 × 5% = 0.125 → 0.13 (half-up, not banker's rounding).
        // Abatement 2.37 × 20% = 0.474 → 0.47.
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 2.50]), [], [], $this->params()
        );

        $this->assertSame(0.13, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(0.47, $result['computation']['taxable_income']['abatements'][0]['amount']);
        $this->assertSame(2.37, $result['computation']['net']);
    }

    public function test_calculation_is_deterministic(): void
    {
        $calculator = $this->calculator();
        $inputs = $this->inputs([
            'base_salary' => 7500.00,
            'lines' => [['component' => 'transport', 'amount' => 250.00]],
            'overtime' => ['normal_hours' => 4, 'night_hours' => 2, 'holiday_hours' => 0, 'hourly_rate' => 40],
        ]);
        $catalog = [[
            'code' => 'transport', 'category' => 'allowance',
            'cnss_subject' => true, 'ir_subject' => false,
            'cap_type' => 'none', 'cap_value' => null,
            'counts_toward_tax_abatement' => false,
        ]];

        $this->assertSame(
            $calculator->calculate($inputs, $catalog, [], $this->params()),
            $calculator->calculate($inputs, $catalog, [], $this->params())
        );
    }

    public function test_rates_come_from_the_parameter_set_not_from_code(): void
    {
        // Same inputs, different employee rate: the result must follow
        // the parameter set. A hardcoded rate would fail this test.
        $low = $this->calculator()->calculate($this->inputs(), [], [], $this->params());
        $high = $this->calculator()->calculate(
            $this->inputs(), [], [], $this->params(['fake.branch.employee_rate' => 0.10])
        );

        $this->assertSame(300.00, $low['computation']['contributions']['employee']['total']);
        $this->assertSame(600.00, $high['computation']['contributions']['employee']['total']);
        $this->assertNotSame($low, $high);
    }

    public function test_invalid_inputs_are_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->calculator()->calculate($this->inputs(['period' => 'Nov 2026']), [], [], $this->params());
    }

    public function test_negative_base_salary_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->calculator()->calculate($this->inputs(['base_salary' => -100.00]), [], [], $this->params());
    }
}
