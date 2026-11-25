<?php

namespace Tests\Unit\Payroll;

use App\Services\Payroll\ParameterSet;
use App\Services\Payroll\PayrollParameterLoader;
use App\Services\Payroll\PayrollRunService;
use PHPUnit\Framework\TestCase;

/**
 * Lifecycle rule tests (BRD §3.4, §9.2, §12.3 step 3b, FR-20, D-01,
 * D-09). These methods are pure — no app boot, no database — so they
 * run in the unit suite. The Eloquent orchestration (create /
 * calculate / validate / approve / close / send-back) is verified
 * live on Railway instead.
 */
final class PayrollRunServiceTest extends TestCase
{
    // --- State machine ------------------------------------------------

    public function test_state_machine_allows_the_five_state_flow(): void
    {
        $this->assertTrue(PayrollRunService::canTransition('draft', 'calculated'));
        $this->assertTrue(PayrollRunService::canTransition('calculated', 'validated'));
        $this->assertTrue(PayrollRunService::canTransition('validated', 'approved'));
        $this->assertTrue(PayrollRunService::canTransition('approved', 'closed'));
    }

    public function test_send_back_returns_any_non_closed_state_to_draft(): void
    {
        $this->assertTrue(PayrollRunService::canTransition('calculated', 'draft'));
        $this->assertTrue(PayrollRunService::canTransition('validated', 'draft'));
        $this->assertTrue(PayrollRunService::canTransition('approved', 'draft'));
        $this->assertFalse(PayrollRunService::canTransition('closed', 'draft'));
    }

    public function test_state_machine_rejects_skips_and_reopens(): void
    {
        $this->assertFalse(PayrollRunService::canTransition('draft', 'validated'));
        $this->assertFalse(PayrollRunService::canTransition('draft', 'approved'));
        $this->assertFalse(PayrollRunService::canTransition('draft', 'closed'));
        $this->assertFalse(PayrollRunService::canTransition('calculated', 'approved'));
        $this->assertFalse(PayrollRunService::canTransition('validated', 'closed'));
        $this->assertFalse(PayrollRunService::canTransition('closed', 'calculated'));
        $this->assertFalse(PayrollRunService::canTransition('approved', 'validated'));
    }

    // --- FR-20: one run per period per scope -------------------------

    public function test_fr20_open_run_blocks_a_second_run_for_the_same_period_and_scope(): void
    {
        $existing = [[
            'period_year' => 2026, 'period_month' => 11, 'scope_type' => 'all',
            'scope_id' => null, 'type' => 'normal', 'status' => 'draft',
        ]];

        $error = PayrollRunService::checkDuplicateRun($existing, 2026, 11, 'all', null);
        $this->assertNotNull($error);
        $this->assertStringContainsString('Only one run per period per scope', $error);
    }

    public function test_fr20_closed_run_blocks_a_new_normal_run(): void
    {
        // A closed period is done: corrections are rectifying runs
        // (P5), not a second normal run for the same period.
        $existing = [[
            'period_year' => 2026, 'period_month' => 11, 'scope_type' => 'all',
            'scope_id' => null, 'type' => 'normal', 'status' => 'closed',
        ]];

        $error = PayrollRunService::checkDuplicateRun($existing, 2026, 11, 'all', null);
        $this->assertNotNull($error);
        $this->assertStringContainsString('already closed', $error);
        $this->assertStringContainsString('rectifying', $error);
    }

    public function test_fr20_allows_a_different_period_scope_or_type(): void
    {
        $existing = [[
            'period_year' => 2026, 'period_month' => 11, 'scope_type' => 'all',
            'scope_id' => null, 'type' => 'normal', 'status' => 'draft',
        ]];

        $this->assertNull(PayrollRunService::checkDuplicateRun($existing, 2026, 12, 'all', null));
        $this->assertNull(PayrollRunService::checkDuplicateRun($existing, 2026, 11, 'department', 'eng'));
        $this->assertNull(PayrollRunService::checkDuplicateRun([], 2026, 11, 'all', null));
    }

    public function test_fr20_ignores_rectifying_runs(): void
    {
        $existing = [[
            'period_year' => 2026, 'period_month' => 11, 'scope_type' => 'all',
            'scope_id' => null, 'type' => 'rectifying', 'status' => 'draft',
        ]];

        $this->assertNull(PayrollRunService::checkDuplicateRun($existing, 2026, 11, 'all', null));
    }

    // --- D-01: separation of duties ---------------------------------

    public function test_d01_calculator_cannot_approve(): void
    {
        $error = PayrollRunService::checkApprover('user-calc', 'user-val', 'user-calc');
        $this->assertNotNull($error);
        $this->assertStringContainsString('calculated', $error);
    }

    public function test_d01_validator_cannot_approve(): void
    {
        $error = PayrollRunService::checkApprover('user-calc', 'user-val', 'user-val');
        $this->assertNotNull($error);
        $this->assertStringContainsString('validated', $error);
    }

    public function test_d01_different_hr_admin_may_approve(): void
    {
        $this->assertNull(PayrollRunService::checkApprover('user-calc', 'user-val', 'user-other'));
    }

    public function test_d01_missing_audit_entries_mean_unknown_not_blocked(): void
    {
        // The audit log is best-effort: a missing entry means the
        // actor is unknown, and an unknown actor cannot be proven to
        // be the approver — approval is allowed.
        $this->assertNull(PayrollRunService::checkApprover(null, null, 'user-other'));
        $this->assertNull(PayrollRunService::checkApprover(null, 'user-val', 'user-other'));
    }

    // --- §12.3 step 3b: close-block ---------------------------------

    private function parameterSet(array $confidences): ParameterSet
    {
        $keys = array_keys($confidences);

        return new ParameterSet('MA', '2026.1', null, '2026-11-01', array_fill_keys($keys, 1.0), $confidences);
    }

    public function test_close_block_lists_every_unvalidated_used_key(): void
    {
        $params = $this->parameterSet([
            'cnss.ceiling' => 'secondary',
            'amo.employee' => 'secondary',
            'ir.bracket.4.rate' => 'secondary',
        ]);

        $this->assertSame(
            ['cnss.ceiling', 'amo.employee', 'ir.bracket.4.rate'],
            PayrollRunService::checkCloseBlock(['cnss.ceiling', 'amo.employee', 'ir.bracket.4.rate'], $params)
        );
    }

    public function test_close_block_ignores_official_and_confirmed_keys(): void
    {
        $params = $this->parameterSet([
            'cnss.ceiling' => 'official',
            'amo.employee' => 'confirmed',
            'ir.bracket.4.rate' => 'secondary',
        ]);

        $this->assertSame(
            ['ir.bracket.4.rate'],
            PayrollRunService::checkCloseBlock(['cnss.ceiling', 'amo.employee', 'ir.bracket.4.rate'], $params)
        );
    }

    public function test_close_block_passes_when_nothing_was_used_or_everything_is_validated(): void
    {
        $params = $this->parameterSet(['cnss.ceiling' => 'official']);
        $this->assertSame([], PayrollRunService::checkCloseBlock([], $params));
        $this->assertSame([], PayrollRunService::checkCloseBlock(['cnss.ceiling'], $params));
    }

    public function test_close_block_treats_a_key_missing_from_the_set_as_unvalidated(): void
    {
        $params = $this->parameterSet(['cnss.ceiling' => 'official']);

        $this->assertSame(
            ['amo.employee'],
            PayrollRunService::checkCloseBlock(['cnss.ceiling', 'amo.employee'], $params)
        );
    }

    // --- D-16: disabled jurisdiction ---------------------------------

    public function test_disabled_jurisdiction_blocks_calculation(): void
    {
        $this->assertNotNull(PayrollRunService::checkJurisdictionEnabled('disabled'));
        $this->assertNotNull(PayrollRunService::checkJurisdictionEnabled(null));
        $this->assertNull(PayrollRunService::checkJurisdictionEnabled('enabled'));
    }

    // --- D-09: seniority rate table ---------------------------------

    public function test_seniority_rate_picks_the_highest_matching_band(): void
    {
        $bands = [
            ['min_years' => 2, 'rate' => 0.05],
            ['min_years' => 5, 'rate' => 0.10],
            ['min_years' => 10, 'rate' => 0.15],
            ['min_years' => 15, 'rate' => 0.20],
        ];

        $this->assertSame(0.0, PayrollRunService::seniorityRate($bands, 1));
        $this->assertSame(0.05, PayrollRunService::seniorityRate($bands, 2));
        $this->assertSame(0.05, PayrollRunService::seniorityRate($bands, 4));
        $this->assertSame(0.10, PayrollRunService::seniorityRate($bands, 5));
        $this->assertSame(0.10, PayrollRunService::seniorityRate($bands, 9));
        $this->assertSame(0.15, PayrollRunService::seniorityRate($bands, 10));
        $this->assertSame(0.20, PayrollRunService::seniorityRate($bands, 30));
        $this->assertSame(0.0, PayrollRunService::seniorityRate([], 10));
    }

    public function test_seniority_rate_ignores_malformed_bands(): void
    {
        $bands = [
            ['min_years' => -1, 'rate' => 0.50],
            ['min_years' => 5, 'rate' => 0.0],
            ['min_years' => 5, 'rate' => 1.50],
            ['min_years' => 5, 'rate' => 0.10],
        ];

        $this->assertSame(0.10, PayrollRunService::seniorityRate($bands, 10));
    }

    public function test_years_of_service_counts_full_years_only(): void
    {
        $this->assertSame(3, PayrollRunService::yearsOfService('2023-05-02', '2026-11-01'));
        $this->assertSame(2, PayrollRunService::yearsOfService('2023-12-01', '2026-11-01'));
        $this->assertSame(0, PayrollRunService::yearsOfService('2026-11-01', '2026-11-01'));
        $this->assertSame(0, PayrollRunService::yearsOfService(null, '2026-11-01'));
        $this->assertSame(0, PayrollRunService::yearsOfService('2027-01-01', '2026-11-01'));
    }

    // --- Minimum wage + YTD ------------------------------------------

    public function test_minimum_wage_monthly_is_smig_times_contractual_hours(): void
    {
        // SMIG 17.92 DH/h × 191 h = 3,422.72 DH/month (P2 low-salary vector).
        $this->assertSame(3422.72, PayrollRunService::minimumWageMonthly(17.92, 191));
        $this->assertNull(PayrollRunService::minimumWageMonthly(null, 191));
        $this->assertNull(PayrollRunService::minimumWageMonthly(17.92, 0));
    }

    public function test_accumulate_ytd_sums_earlier_payslips_of_the_year(): void
    {
        $snapshots = [
            ['computation' => ['gross' => 10500.00, 'contributions' => ['employee' => ['total' => 494.80]], 'tax' => ['amount' => 451.56]]],
            ['computation' => ['gross' => 10500.00, 'contributions' => ['employee' => ['total' => 494.80]], 'tax' => ['amount' => 451.56]]],
        ];

        $this->assertSame(
            ['gross' => 21000.00, 'cnss_employee' => 989.60, 'ir' => 903.12],
            PayrollRunService::accumulateYtd($snapshots)
        );
        $this->assertSame(
            ['gross' => 0.0, 'cnss_employee' => 0.0, 'ir' => 0.0],
            PayrollRunService::accumulateYtd([])
        );
    }

    // --- Regression: service must load (25 Nov 2026 fix) -------------

    public function test_service_instantiates_with_a_real_loader(): void
    {
        // Regression test for the P3 500s (25 Nov 2026): validationResults()
        // appended check entries with
        // `($check['blocking'] ? $blocking : $warnings)[] = ...`, which
        // PHP rejects at parse time ("Cannot use temporary expression in
        // write context"). The whole service file then failed to load, so
        // Laravel's container could not instantiate it — and every route
        // handled by the two controllers that inject it (PayrollRunController,
        // PayrollClientConfigController) returned HTTP 500, while the
        // parameters/components/structures endpoints (no service injection)
        // kept working. Instantiating the service here proves the class
        // loads; the static tests above already prove its rules.
        $service = new PayrollRunService(new PayrollParameterLoader);

        $this->assertInstanceOf(PayrollRunService::class, $service);
    }
}
