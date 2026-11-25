<?php

namespace Tests\Unit\Payroll;

use App\Services\Payroll\MoroccoPayrollAdapter;
use App\Services\Payroll\ParameterSet;
use App\Services\Payroll\PayrollCalculator;
use App\Services\Payroll\PayrollRunService;
use PHPUnit\Framework\TestCase;

/**
 * Calculator-through-adapter tests with run-shaped inputs (BRD §6.4,
 * §7.8, §13 P3): the same inputs PayrollRunService builds for a run
 * — structure lines, manual overtime (D-10), dependants from the
 * employee record (D-05), seniority from the client-config rate
 * table (D-09) — run through the P1 engine + the Morocco adapter.
 *
 * Every expected figure is hand-computed and cross-checked against
 * an independent float model (the model mirrors PHP's float
 * arithmetic + half-up rounding; it reproduces all three P2 vectors
 * exactly, so it is trustworthy for the new vectors here).
 *
 * The parameter set below is the same MA 2026.1 set as
 * MoroccoPayrollAdapterTest (all confidence = secondary, none of
 * V-01…V-15 validated yet).
 */
final class PayrollRunCalculationTest extends TestCase
{
    private function moroccoParams(): ParameterSet
    {
        $values = [
            'cnss.ceiling' => 6000,
            'cnss.family.employer' => 0.0640,
            'cnss.short_term.employer' => 0.0105,
            'cnss.short_term.employee' => 0.0052,
            'cnss.long_term.employer' => 0.0793,
            'cnss.long_term.employee' => 0.0396,
            'amo.employer' => 0.0411,
            'amo.employee' => 0.0226,
            'amo.employer.solidarity_only' => 0.0185,
            'tfp.employer' => 0.0160,
            'ir.bracket.1.min' => 0, 'ir.bracket.1.rate' => 0.00, 'ir.bracket.1.deduction' => 0,
            'ir.bracket.2.min' => 40000, 'ir.bracket.2.rate' => 0.10, 'ir.bracket.2.deduction' => 4000,
            'ir.bracket.3.min' => 60000, 'ir.bracket.3.rate' => 0.20, 'ir.bracket.3.deduction' => 10000,
            'ir.bracket.4.min' => 80000, 'ir.bracket.4.rate' => 0.30, 'ir.bracket.4.deduction' => 18000,
            'ir.bracket.5.min' => 100000, 'ir.bracket.5.rate' => 0.34, 'ir.bracket.5.deduction' => 22000,
            'ir.bracket.6.min' => 180000, 'ir.bracket.6.rate' => 0.37, 'ir.bracket.6.deduction' => 27400,
            'ir.frais_pro.rate_low' => 0.35,
            'ir.frais_pro.rate_high' => 0.25,
            'ir.frais_pro.threshold' => 78000,
            'ir.frais_pro.cap' => 35000,
            'ir.family_per_person' => 600,
            'ir.family_cap_persons' => 6,
            'smig.hourly' => 17.92,
            'smag.daily' => 97.44,
            'ir.exempt.transport.urban' => 500, 'ir.exempt.transport.non_urban' => 750,
            'cnss.exempt.transport.urban' => 500, 'cnss.exempt.transport.non_urban' => 750,
            'ir.exempt.travel_flat_rate.pct' => 1.00, 'ir.exempt.travel_flat_rate.cap' => 5000,
            'cnss.exempt.travel_flat_rate.pct' => 1.00, 'cnss.exempt.travel_flat_rate.cap' => 5000,
            'ir.exempt.km_rate' => 3, 'cnss.exempt.km_rate' => 3,
            'ir.exempt.representation.pct' => 0.10, 'cnss.exempt.representation.pct' => 0.10,
            'ir.exempt.meal_voucher.day' => 40, 'ir.exempt.meal_voucher.pct_gross' => 0.20,
            'cnss.exempt.meal_voucher.smig_multiple' => 2,
            'ir.exempt.dismissal_cap' => 1000000, 'cnss.exempt.dismissal_cap' => 1000000,
            'cnss.exempt.voluntary_departure.smig_multiple' => 2080,
            'cnss.exempt.social_event_bonus.year' => 5000,
            'ir.exempt.social_event_bonus.year' => 2500,
            'ir.exempt.internship_cap' => 6000, 'cnss.exempt.internship_cap' => 6000,
            'ir.exempt.tournee_bonus.month' => 1500, 'cnss.exempt.tournee_bonus.month' => 1500,
            'cnss.exempt.allowance_caisse.smig_multiple' => 14,
            'cnss.exempt.allowance_lait.smig_multiple' => 11,
            'cnss.exempt.allowance_outillage.smig_multiple' => 7,
            'cnss.exempt.allowance_salissure.smig_multiple' => 14,
            'overtime.uplift.normal' => 1.25,
            'overtime.uplift.night' => 1.50,
            'overtime.uplift.holiday' => 2.00,
        ];
        $confidences = array_fill_keys(array_keys($values), 'secondary');

        return new ParameterSet('MA', '2026.1', 1, '2026-01-01', $values, $confidences);
    }

    /**
     * The inputs PayrollRunService builds for one employee: base
     * salary + structure lines, manual overtime (D-10) with the
     * hourly rate from base / contractual hours, dependants from the
     * employee record (D-05: dependants_count + spouse).
     */
    private function runInputs(int $employeeId, float $baseSalary, array $lines, int $dependants, array $overtime = [], string $period = '2026-11'): array
    {
        return [
            'tenant_id' => 1,
            'period' => $period,
            'employee' => ['id' => $employeeId, 'cnss_number' => 'CNSS-' . $employeeId, 'category' => 'Cadre', 'hired_at' => '2023-05-02', 'dependants' => $dependants],
            'base_salary' => $baseSalary,
            'lines' => $lines,
            'overtime' => $overtime,
            'deductions' => [],
            'versions' => ['parameter_set_id' => 1, 'client_config_version' => 1, 'component_catalog_version' => 1],
        ];
    }

    private function catalog(): array
    {
        return [
            ['code' => 'transport', 'category' => 'allowance', 'cnss_subject' => false, 'ir_subject' => false, 'cap_type' => 'fixed_period', 'cap_value' => 500, 'counts_toward_tax_abatement' => false],
            ['code' => 'seniority', 'category' => 'bonus', 'cnss_subject' => true, 'ir_subject' => true, 'cap_type' => 'none', 'cap_value' => null, 'counts_toward_tax_abatement' => false],
        ];
    }

    private function calculator(): PayrollCalculator
    {
        return new PayrollCalculator(new MoroccoPayrollAdapter);
    }

    public function test_worked_example_through_run_shaped_inputs(): void
    {
        // Ahmed Benali (1047): base 10,000 + transport 500, 3
        // dependants (2 children + spouse) — the BRD §6.4 vector,
        // built the way the run service builds it.
        $result = $this->calculator()->calculate(
            $this->runInputs(1047, 10000.00, [['component' => 'transport', 'amount' => 500.00]], 3),
            $this->catalog(),
            [],
            $this->moroccoParams()
        );

        $this->assertSame(10500.00, $result['computation']['gross']);
        $this->assertSame(10000.00, $result['computation']['social_base']);
        $this->assertSame(494.80, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(1749.80, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(451.56, $result['computation']['tax']['amount']);
        $this->assertSame(9553.64, $result['computation']['net']);
        $this->assertSame(12249.80, $result['computation']['employer_cost']);
        $this->assertSame(3, $result['inputs']['employee']['dependants']);
    }

    public function test_seniority_bonus_line_from_the_client_config_rate_table(): void
    {
        // D-09: 7 years of service, bands 2y/5%, 5y/10%, 10y/15%,
        // 15y/20% → the 5% band wins (7 years). Seniority =
        // 10,000 × 5% = 500.00, fully taxable and contributory.
        $bands = [
            ['min_years' => 2, 'rate' => 0.05],
            ['min_years' => 5, 'rate' => 0.10],
            ['min_years' => 10, 'rate' => 0.15],
            ['min_years' => 15, 'rate' => 0.20],
        ];
        $rate = PayrollRunService::seniorityRate($bands, 7);
        $this->assertSame(0.05, $rate);
        $seniority = round(10000.00 * $rate, 2, PHP_ROUND_HALF_UP);
        $this->assertSame(500.00, $seniority);

        $result = $this->calculator()->calculate(
            $this->runInputs(1047, 10000.00, [
                ['component' => 'transport', 'amount' => 500.00],
                ['component' => 'seniority', 'amount' => $seniority],
            ], 3),
            $this->catalog(),
            [],
            $this->moroccoParams()
        );

        // Gross 11,000; social/tax base 10,500 (transport exempt).
        $this->assertSame(11000.00, $result['computation']['gross']);
        $this->assertSame(10500.00, $result['computation']['social_base']);
        $this->assertSame(10500.00, $result['computation']['tax_base']);
        // The seniority line is fully taxable/contributory.
        $this->assertSame(0.00, $result['inputs']['lines'][1]['exempt_cnss']);
        $this->assertSame(0.00, $result['inputs']['lines'][1]['exempt_ir']);
        $this->assertSame([
            'cnss_family' => 0.00, 'cnss_short_term' => 31.20, 'cnss_long_term' => 237.60,
            'amo' => 237.30, 'tfp' => 0.00,
        ], $result['computation']['contributions']['employee']['by_branch']);
        $this->assertSame([
            'cnss_family' => 672.00, 'cnss_short_term' => 63.00, 'cnss_long_term' => 475.80,
            'amo' => 431.55, 'tfp' => 168.00,
        ], $result['computation']['contributions']['employer']['by_branch']);
        $this->assertSame(506.10, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(1810.35, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(10500.00, $result['computation']['taxable_income']['sbi']);
        $this->assertSame(2625.00, $result['computation']['taxable_income']['abatements'][0]['amount']);
        $this->assertSame(7368.90, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(4, $result['computation']['tax']['details']['bracket']);
        $this->assertSame(710.67, $result['computation']['tax']['details']['gross_tax_month']);
        $this->assertSame(150.00, $result['computation']['tax']['details']['family_reduction_month']);
        $this->assertSame(560.67, $result['computation']['tax']['amount']);
        $this->assertSame(9933.23, $result['computation']['net']);
        $this->assertSame(12810.35, $result['computation']['employer_cost']);
    }

    public function test_manual_overtime_entry(): void
    {
        // D-10: 10 normal hours, hourly rate = base / 191 h =
        // 10,000 / 191 = 52.35602094240838. Overtime =
        // 10 × 52.35602094240838 × 1.25 = 654.45.
        $result = $this->calculator()->calculate(
            $this->runInputs(1047, 10000.00, [], 0, [
                'normal_hours' => 10, 'night_hours' => 0, 'holiday_hours' => 0,
                'hourly_rate' => 10000.00 / 191,
            ]),
            $this->catalog(),
            [],
            $this->moroccoParams()
        );

        $this->assertSame(654.45, $result['inputs']['lines'][0]['amount']);
        $this->assertSame('overtime', $result['inputs']['lines'][0]['component']);
        $this->assertSame(10654.45, $result['computation']['gross']);
        $this->assertSame(10654.45, $result['computation']['social_base']);
        $this->assertSame([
            'cnss_family' => 0.00, 'cnss_short_term' => 31.20, 'cnss_long_term' => 237.60,
            'amo' => 240.79, 'tfp' => 0.00,
        ], $result['computation']['contributions']['employee']['by_branch']);
        $this->assertSame([
            'cnss_family' => 681.88, 'cnss_short_term' => 63.00, 'cnss_long_term' => 475.80,
            'amo' => 437.90, 'tfp' => 170.47,
        ], $result['computation']['contributions']['employer']['by_branch']);
        $this->assertSame(509.59, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(1829.05, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(2663.61, $result['computation']['taxable_income']['abatements'][0]['amount']);
        $this->assertSame(7481.25, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(744.38, $result['computation']['tax']['amount']);
        $this->assertSame(9400.48, $result['computation']['net']);
        $this->assertSame(12483.50, $result['computation']['employer_cost']);
    }

    public function test_two_employee_mini_run_totals(): void
    {
        // Ahmed (3 dependants) + Nadia (2 dependants: 1 child +
        // spouse). Same base and transport line; only the family
        // reduction differs (150.00 vs 100.00).
        $ahmed = $this->calculator()->calculate(
            $this->runInputs(1047, 10000.00, [['component' => 'transport', 'amount' => 500.00]], 3),
            $this->catalog(), [], $this->moroccoParams()
        );
        $nadia = $this->calculator()->calculate(
            $this->runInputs(1043, 10000.00, [['component' => 'transport', 'amount' => 500.00]], 2),
            $this->catalog(), [], $this->moroccoParams()
        );

        $this->assertSame(100.00, $nadia['computation']['tax']['details']['family_reduction_month']);
        $this->assertSame(501.56, $nadia['computation']['tax']['amount']);
        $this->assertSame(9503.64, $nadia['computation']['net']);

        // Run totals, as the service sums them (D-04 rounding per line).
        $this->assertSame(21000.00, round($ahmed['computation']['gross'] + $nadia['computation']['gross'], 2));
        $this->assertSame(19057.28, round($ahmed['computation']['net'] + $nadia['computation']['net'], 2));
        $this->assertSame(989.60, round($ahmed['computation']['contributions']['employee']['total'] + $nadia['computation']['contributions']['employee']['total'], 2));
        $this->assertSame(3499.60, round($ahmed['computation']['contributions']['employer']['total'] + $nadia['computation']['contributions']['employer']['total'], 2));
        $this->assertSame(953.12, round($ahmed['computation']['tax']['amount'] + $nadia['computation']['tax']['amount'], 2));
        $this->assertSame(24499.60, round($ahmed['computation']['employer_cost'] + $nadia['computation']['employer_cost'], 2));
    }

    public function test_ytd_accumulates_across_periods(): void
    {
        // January + February payslips (worked example each), then the
        // March run's YTD is the sum of the two.
        $january = $this->calculator()->calculate(
            $this->runInputs(1047, 10000.00, [['component' => 'transport', 'amount' => 500.00]], 3, [], '2026-01'),
            $this->catalog(), [], $this->moroccoParams()
        );
        $february = $this->calculator()->calculate(
            $this->runInputs(1047, 10000.00, [['component' => 'transport', 'amount' => 500.00]], 3, [], '2026-02'),
            $this->catalog(), [], $this->moroccoParams()
        );

        $this->assertSame(
            ['gross' => 21000.00, 'cnss_employee' => 989.60, 'ir' => 903.12],
            PayrollRunService::accumulateYtd([$january, $february])
        );
    }
}
