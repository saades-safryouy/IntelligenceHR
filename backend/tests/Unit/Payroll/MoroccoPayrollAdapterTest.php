<?php

namespace Tests\Unit\Payroll;

use App\Services\Payroll\MissingPayrollParameterException;
use App\Services\Payroll\MoroccoPayrollAdapter;
use App\Services\Payroll\ParameterSet;
use App\Services\Payroll\PayrollCalculator;
use PHPUnit\Framework\TestCase;

/**
 * Morocco profile tests (BRD §6.4, §12.2): the PayrollCalculator with
 * the Morocco adapter, independently of any other jurisdiction. Every
 * expected figure below is hand-computed from the Morocco parameter
 * set and cross-checked against an independent float model (the
 * reference model mirrors PHP's float arithmetic + half-up rounding,
 * so boundary values such as AMO 127.12 on the overtime vector are
 * the float results, not the exact-decimal ones).
 *
 * Morocco parameters supplied by the test (never hardcoded in the
 * adapter): CNSS family 6.40% / short-term 1.05%/0.52% / long-term
 * 7.93%/3.96% capped at 6,000 / AMO 4.11%/2.26% / TFP 1.60%; IR
 * brackets 0/10/20/30/34/37% with deductions 0/4,000/10,000/18,000/
 * 22,000/27,400; frais professionnels 35% ≤78,000 else 25%, cap
 * 35,000/year; family reduction 600/person (2026) or 500 (2025), max
 * 6 persons; SMIG 17.92 (2026) / 17.10 (2025) DH/h.
 */
final class MoroccoPayrollAdapterTest extends TestCase
{
    /**
     * The full MA parameter set for a year. $confidence applies one
     * label to every key (for the close-block tests); $without removes
     * keys (for the missing-parameter tests).
     */
    private function moroccoParams(string $year = '2026', array $overrides = [], ?string $confidence = null, array $without = []): ParameterSet
    {
        $family = $year === '2026' ? 600 : 500;
        $smig = $year === '2026' ? 17.92 : 17.10;
        $smag = $year === '2026' ? 97.44 : 93.00;

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
            'ir.family_per_person' => $family,
            'ir.family_cap_persons' => 6,
            'smig.hourly' => $smig,
            'smag.daily' => $smag,
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
        $values = array_merge($values, $overrides);
        foreach ($without as $key) {
            unset($values[$key]);
        }
        $confidences = $confidence === null ? [] : array_fill_keys(array_keys($values), $confidence);

        return new ParameterSet('MA', '2026.1', 1, $year.'-01-01', $values, $confidences);
    }

    private function inputs(array $overrides = []): array
    {
        return array_merge([
            'tenant_id' => 1,
            'period' => '2026-06',
            'employee' => ['id' => 1047, 'cnss_number' => 'CNSS-1047', 'category' => 'Cadre', 'hired_at' => '2023-05-02', 'dependants' => 0],
            'base_salary' => 10000.00,
            'lines' => [],
            'overtime' => [],
            'deductions' => [],
            'versions' => ['parameter_set_id' => 1, 'client_config_version' => 1, 'component_catalog_version' => 1],
        ], $overrides);
    }

    private function transportCatalog(): array
    {
        return [[
            'code' => 'transport', 'category' => 'allowance',
            'cnss_subject' => false, 'ir_subject' => false,
            'cap_type' => 'fixed_period', 'cap_value' => 500,
            'counts_toward_tax_abatement' => false,
        ]];
    }

    private function calculator(?MoroccoPayrollAdapter $adapter = null): PayrollCalculator
    {
        return new PayrollCalculator($adapter ?? new MoroccoPayrollAdapter);
    }

    public function test_worked_example_2026_reproduces_exactly(): void
    {
        // BRD §6.4 test vector #1 (ClicPaie example, 2026 parameter set):
        // gross 10,000 salary + 500 transport paid = 10,500.
        // CNSS base 10,000 (transport exempt both tables): capped base
        // 6,000 → CNSS employee 268.80 (31.20 + 237.60), AMO 226.00.
        // Frais pro: annual 120,000 > 78,000 → 25% → 30,000/year → 2,500/month.
        // SNI 7,005.20; annualised 84,062.40 → 30% bracket → IR brut
        // 601.56; family 3 × 600 / 12 = 150.00; IR 451.56; net 9,553.64.
        $inputs = $this->inputs([
            'employee' => ['id' => 1047, 'cnss_number' => 'CNSS-1047', 'category' => 'Cadre', 'hired_at' => '2023-05-02', 'dependants' => 3],
            'lines' => [['component' => 'transport', 'amount' => 500.00]],
        ]);
        $result = $this->calculator()->calculate($inputs, $this->transportCatalog(), [], $this->moroccoParams('2026'));

        $this->assertSame(10500.00, $result['computation']['gross']);
        $this->assertSame(10000.00, $result['computation']['social_base']);
        $this->assertSame(10000.00, $result['computation']['tax_base']);
        $this->assertSame(500.00, $result['inputs']['lines'][0]['exempt_cnss']);
        $this->assertSame(500.00, $result['inputs']['lines'][0]['exempt_ir']);
        $this->assertSame([
            'cnss_family' => 0.00, 'cnss_short_term' => 31.20, 'cnss_long_term' => 237.60,
            'amo' => 226.00, 'tfp' => 0.00,
        ], $result['computation']['contributions']['employee']['by_branch']);
        $this->assertSame([
            'cnss_family' => 640.00, 'cnss_short_term' => 63.00, 'cnss_long_term' => 475.80,
            'amo' => 411.00, 'tfp' => 160.00,
        ], $result['computation']['contributions']['employer']['by_branch']);
        $this->assertSame(494.80, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(1749.80, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(10000.00, $result['computation']['taxable_income']['sbi']);
        $this->assertSame([['key' => 'frais_professionnels', 'amount' => 2500.00]], $result['computation']['taxable_income']['abatements']);
        $this->assertSame(7005.20, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(4, $result['computation']['tax']['details']['bracket']);
        $this->assertSame(0.30, $result['computation']['tax']['details']['rate']);
        $this->assertSame(18000.00, $result['computation']['tax']['details']['deduction']);
        $this->assertSame(601.56, $result['computation']['tax']['details']['gross_tax_month']);
        $this->assertSame(150.00, $result['computation']['tax']['details']['family_reduction_month']);
        $this->assertSame(451.56, $result['computation']['tax']['amount']);
        $this->assertSame(9553.64, $result['computation']['net']);
        $this->assertSame(12249.80, $result['computation']['employer_cost']);
        $this->assertSame('MA', $result['jurisdiction']['code']);
        $this->assertSame('2026.1', $result['jurisdiction']['profile_version']);
    }

    public function test_worked_example_2025_uses_the_2025_family_rate(): void
    {
        // Same example, 2025 parameter set: the family reduction is
        // 3 × 500 / 12 = 125.00 (not 150.00), so IR is 476.56 and the
        // net is 9,528.64. The 25 DH difference between the 2025 and
        // 2026 family rates is flagged for validation (V-13) — the
        // adapter must NOT silently use one rate for both years.
        $inputs = $this->inputs([
            'period' => '2025-06',
            'employee' => ['id' => 1047, 'cnss_number' => 'CNSS-1047', 'category' => 'Cadre', 'hired_at' => '2023-05-02', 'dependants' => 3],
            'lines' => [['component' => 'transport', 'amount' => 500.00]],
        ]);
        $result = $this->calculator()->calculate($inputs, $this->transportCatalog(), [], $this->moroccoParams('2025'));

        $this->assertSame(125.00, $result['computation']['tax']['details']['family_reduction_month']);
        $this->assertSame(476.56, $result['computation']['tax']['amount']);
        $this->assertSame(9528.64, $result['computation']['net']);
        $this->assertSame(7005.20, $result['computation']['taxable_income']['net_taxable']);
    }

    public function test_low_salary_near_smig(): void
    {
        // SMIG monthly gross, 2026: 17.92 × 191 h = 3,422.72.
        // Capped base = the full 3,422.72 (below the 6,000 ceiling).
        // Employee: short 17.80 + long 135.54 + AMO 77.35 = 230.69.
        // Employer: family 219.05 + short 35.94 + long 271.42 + AMO
        // 140.67 + TFP 54.76 = 721.84. Annual taxable 41,072.64 ≤
        // 78,000 → 35% abatement: 14,375.42/year → 1,197.95/month.
        // SNI 1,994.08 → annual 23,928.96 → 0% bracket → IR 0.
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 3422.72]), [], [], $this->moroccoParams('2026')
        );

        $this->assertSame(3422.72, $result['computation']['gross']);
        $this->assertSame(230.69, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(721.84, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(1197.95, $result['computation']['taxable_income']['abatements'][0]['amount']);
        $this->assertSame(1994.08, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(0.00, $result['computation']['tax']['amount']);
        $this->assertSame(3192.03, $result['computation']['net']);
        $this->assertSame(4144.56, $result['computation']['employer_cost']);
        $this->assertSame(17.92, (new MoroccoPayrollAdapter)->minimumWage($this->moroccoParams('2026')));
    }

    public function test_high_salary_crosses_the_cnss_ceiling(): void
    {
        // Gross 25,000: short/long branches are capped at 6,000
        // (employee 31.20 + 237.60, as in the 10,000 case) while family,
        // AMO and TFP run on the full 25,000. AMO employee 565.00.
        // Annual taxable 300,000 → 25% abatement capped at 35,000/year
        // → 2,916.67/month. SNI 21,249.53 → annual 254,994.36 → 37%
        // bracket → IR 5,578.99. Net 18,587.21.
        $result = $this->calculator()->calculate(
            $this->inputs(['base_salary' => 25000.00]), [], [], $this->moroccoParams('2026')
        );

        $this->assertSame(25000.00, $result['computation']['gross']);
        $this->assertSame(31.20, $result['computation']['contributions']['employee']['by_branch']['cnss_short_term']);
        $this->assertSame(237.60, $result['computation']['contributions']['employee']['by_branch']['cnss_long_term']);
        $this->assertSame(565.00, $result['computation']['contributions']['employee']['by_branch']['amo']);
        $this->assertSame(833.80, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(3566.30, $result['computation']['contributions']['employer']['total']);
        $this->assertSame(2916.67, $result['computation']['taxable_income']['abatements'][0]['amount']);
        $this->assertSame(21249.53, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(6, $result['computation']['tax']['details']['bracket']);
        $this->assertSame(5578.99, $result['computation']['tax']['amount']);
        $this->assertSame(18587.21, $result['computation']['net']);
        $this->assertSame(28566.30, $result['computation']['employer_cost']);
    }

    public function test_transport_cap_limits_the_exempt_part(): void
    {
        // Urban transport 600 DH: only 500 is exempt (both tables);
        // the 100 excess stays in both bases. Gross 5,600; bases 5,100.
        // Employee 343.74, employer 1,075.59; abatement 1,785.00;
        // SNI 2,971.26 → 0% bracket → IR 0; net 5,256.26.
        $result = $this->calculator()->calculate(
            $this->inputs([
                'base_salary' => 5000.00,
                'lines' => [['component' => 'transport', 'amount' => 600.00]],
            ]),
            $this->transportCatalog(), [], $this->moroccoParams('2026')
        );

        $this->assertSame(500.00, $result['inputs']['lines'][0]['exempt_cnss']);
        $this->assertSame(500.00, $result['inputs']['lines'][0]['exempt_ir']);
        $this->assertSame(5100.00, $result['computation']['social_base']);
        $this->assertSame(5100.00, $result['computation']['tax_base']);
        $this->assertSame(343.74, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(5256.26, $result['computation']['net']);
        $this->assertSame(6675.59, $result['computation']['employer_cost']);
    }

    public function test_overtime_is_paid_through_the_adapter_uplifts(): void
    {
        // 10 normal hours × 50 DH × 1.25 = 625 overtime; gross 5,625.
        // Employee: short 29.25 + long 222.75 + AMO 127.12 = 379.12.
        // (AMO is 2.26% × 5,625 = 127.125 exactly, which the float
        // arithmetic behind the engine yields as 127.124999… and
        // rounds to 127.12 — the test asserts the float result. Note
        // the core sums the already-rounded branch amounts, so the
        // employee total is 379.12; summing the raw products first
        // would give 379.13 — the core's convention wins.)
        // Employer 1,186.31; abatement 1,968.75; SNI 3,277.13 → 0%
        // bracket → IR 0; net 5,245.88.
        $result = $this->calculator()->calculate(
            $this->inputs([
                'base_salary' => 5000.00,
                'overtime' => ['normal_hours' => 10, 'night_hours' => 0, 'holiday_hours' => 0, 'hourly_rate' => 50],
            ]),
            [], [], $this->moroccoParams('2026')
        );

        $this->assertSame(5625.00, $result['computation']['gross']);
        $this->assertSame(127.12, $result['computation']['contributions']['employee']['by_branch']['amo']);
        $this->assertSame(379.12, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(3277.13, $result['computation']['taxable_income']['net_taxable']);
        $this->assertSame(0.00, $result['computation']['tax']['amount']);
        $this->assertSame(5245.88, $result['computation']['net']);
        $this->assertSame(6811.31, $result['computation']['employer_cost']);
    }

    public function test_no_overtime_needs_no_uplift_parameters(): void
    {
        // A run without overtime must not fail on the missing uplift
        // keys (interface contract, same as the fake adapter).
        $params = $this->moroccoParams('2026', [], null, [
            'overtime.uplift.normal', 'overtime.uplift.night', 'overtime.uplift.holiday',
        ]);
        $result = $this->calculator()->calculate($this->inputs(), [], [], $params);

        $this->assertSame(10000.00, $result['computation']['gross']);
    }

    public function test_missing_parameter_fails_loudly_with_its_key(): void
    {
        $params = $this->moroccoParams('2026', [], null, ['amo.employee']);

        $this->expectException(MissingPayrollParameterException::class);
        $this->expectExceptionMessage('amo.employee');

        $this->calculator()->calculate($this->inputs(), [], [], $params);
    }

    public function test_rates_come_from_the_parameter_set_not_from_code(): void
    {
        // Same inputs, AMO employee rate 2.26% → 5%: the result must
        // follow the parameter set. AMO employee 500.00, total 768.80;
        // SNI 6,731.20 → annual 80,774.40 → 30% bracket → IR brut
        // 519.36 − family 150.00 = 369.36; net 9,361.84.
        $inputs = $this->inputs([
            'employee' => ['id' => 1047, 'cnss_number' => 'CNSS-1047', 'category' => 'Cadre', 'hired_at' => '2023-05-02', 'dependants' => 3],
            'lines' => [['component' => 'transport', 'amount' => 500.00]],
        ]);
        $result = $this->calculator()->calculate(
            $inputs, $this->transportCatalog(), [],
            $this->moroccoParams('2026', ['amo.employee' => 0.05])
        );

        $this->assertSame(768.80, $result['computation']['contributions']['employee']['total']);
        $this->assertSame(369.36, $result['computation']['tax']['amount']);
        $this->assertSame(9361.84, $result['computation']['net']);
    }

    public function test_profile_identity_mentions_and_reporting_pack(): void
    {
        $adapter = new MoroccoPayrollAdapter;
        $params2026 = $this->moroccoParams('2026');
        $params2025 = $this->moroccoParams('2025');

        $this->assertSame('MA', $adapter->code());
        $this->assertSame('2026.1', $adapter->profileVersion());
        $this->assertSame(17.92, $adapter->minimumWage($params2026));
        $this->assertSame(17.10, $adapter->minimumWage($params2025));
        $this->assertCount(12, $adapter->mandatoryPayslipMentions());
        $this->assertContains('net_salary', $adapter->mandatoryPayslipMentions());
        $this->assertSame(
            ['bds', 'ir_summary', 'etat_9421'],
            array_column($adapter->reportingPack(), 'key')
        );
    }

    public function test_disabled_jurisdiction_is_a_blocking_validation_failure(): void
    {
        $adapter = new MoroccoPayrollAdapter;

        $disabled = $adapter->validationChecks(['jurisdiction_status' => 'disabled']);
        $this->assertCount(1, $disabled);
        $this->assertSame('ma.jurisdiction.disabled', $disabled[0]['code']);
        $this->assertTrue($disabled[0]['blocking']);

        $this->assertSame([], $adapter->validationChecks(['jurisdiction_status' => 'enabled']));
        $this->assertSame([], $adapter->validationChecks([]));

        $missing = $adapter->validationChecks(['employee' => ['cnss_number' => null, 'hired_at' => null]]);
        $this->assertSame(['ma.cnss_number.missing', 'ma.hired_at.missing'], array_column($missing, 'code'));
        $this->assertTrue($missing[0]['blocking']);
        $this->assertSame([], $adapter->validationChecks(['employee' => ['cnss_number' => 'CNSS-1', 'hired_at' => '2024-02-01']]));
    }

    public function test_unvalidated_parameters_are_reported_for_the_close_block(): void
    {
        // BRD §12.3 step 3b: P3 blocks closing a run while any
        // parameter the calculation used is unvalidated. With every
        // confidence 'secondary' (the P2 seed), the used keys are all
        // unvalidated; with every confidence 'official', none are.
        $adapter = new MoroccoPayrollAdapter;
        $calculator = $this->calculator($adapter);
        $calculator->calculate($this->inputs(), [], [], $this->moroccoParams('2026', [], 'secondary'));

        $used = $adapter->usedParameterKeys();
        $this->assertContains('cnss.ceiling', $used);
        $this->assertContains('amo.employee', $used);
        $this->assertContains('ir.bracket.4.rate', $used);
        $this->assertNotEmpty($used);

        $secondary = $this->moroccoParams('2026', [], 'secondary');
        $this->assertFalse($secondary->isValidated('cnss.ceiling'));
        $this->assertSame($used, $secondary->unvalidatedKeys($used));

        $official = $this->moroccoParams('2026', [], 'official');
        $this->assertTrue($official->isValidated('cnss.ceiling'));
        $this->assertSame([], $official->unvalidatedKeys($used));
        $this->assertSame([], $official->unvalidatedKeys());
        $this->assertNull($this->moroccoParams('2026')->confidence('cnss.ceiling'));
    }
}
