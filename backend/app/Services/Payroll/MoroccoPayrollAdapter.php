<?php

namespace App\Services\Payroll;

/**
 * Morocco jurisdiction profile (MA), version 2026.1 (BRD §5.2, §6).
 *
 * The adapter implements the §5.2 core ↔ profile contract for Morocco.
 * It reads EVERY number from the ParameterSet — it contains no literal
 * rate, bracket, ceiling or cap (BRD §11.1 rule 1: the only numeric
 * literals here are 0, 1 and 12). A missing key fails loudly with
 * "missing parameter" (MissingPayrollParameterException) — never a
 * silent 0 or a guessed value.
 *
 * Pipeline (§6.4): gross → social exemptions (arrêté 1314-25) →
 * CNSS/AMO/TFP branches → tax exemptions (CGI art. 57) → taxable
 * income (SBI → frais professionnels → SNI) → IR (annual scale ÷ 12,
 * family reduction deducted from the tax) → net → employer cost.
 *
 * Documented traps (BRD §6.1 — do not "fix" these by editing numbers):
 * 1. IPE double-count: the short-term 1.05%/0.52% already INCLUDES
 *    the IPE (0.38%/0.19%). Never add IPE as a separate branch.
 * 2. AMO solidarity double-count: AMO employer 4.11% = 2.26% base +
 *    1.85% solidarity — a component, not an addition.
 *
 * Confidence: every parameter in the P2 seed is `secondary` (none of
 * V-01…V-15 validated yet). The close-block hook is
 * ParameterSet::unvalidatedKeys() over usedParameterKeys() below.
 *
 * Known limits (v1, to be closed by later phases — see the notes):
 * - The frais-professionnels base is the full SBI. The research flags
 *   (secondary only) that benefits in kind are excluded from that
 *   base; the core does not pass line-level data to taxableIncome(),
 *   so the exclusion is NOT applied here. Flagged for V-04.
 * - Meal vouchers: the IR 40 DH/day rule and the 20%-of-gross rule
 *   need the number of days and the gross, which the exemption hooks
 *   do not receive. The adapter enforces only the catalog cap for
 *   meal vouchers; the per-day / 20% checks belong to run validation
 *   (P3), where days and gross are known.
 * - Representation allowance (10% of basic salary) likewise needs the
 *   basic salary in the hook: the adapter enforces the catalog DH cap
 *   and the 10% rule is a P3 validation check.
 * - AMO partial exemption (1.85% only, art. 114 loi 65-00) is a
 *   client flag (BRD §6.1). It is NOT read from the parameter set:
 *   enable it with setAmoPartialExemption(true); P3 wires the flag
 *   from the client configuration (§4).
 * - A disabled jurisdiction must never calculate. The calculator has
 *   no access to enablement state, so the refusal lives in
 *   validationChecks(): P3 passes jurisdiction_status and refuses to
 *   calculate when the check below is blocking.
 */
final class MoroccoPayrollAdapter implements JurisdictionAdapterInterface
{
    public const JURISDICTION_CODE = 'MA';
    public const PROFILE_VERSION = '2026.1';

    /** @var array<string, bool> parameter keys read during calculations. */
    private array $usedKeys = [];

    /** Client flag: employer already had group medical cover (art. 114). */
    private bool $amoPartialExemption = false;

    public function code(): string
    {
        return self::JURISDICTION_CODE;
    }

    public function profileVersion(): string
    {
        return self::PROFILE_VERSION;
    }

    /**
     * Enable the AMO partial exemption (employer pays only the 1.85%
     * solidarity contribution). Default off. P3 wires this from the
     * client configuration; P2 has no client-config plumbing yet.
     */
    public function setAmoPartialExemption(bool $enabled): void
    {
        $this->amoPartialExemption = $enabled;
    }

    /** Distinct parameter keys this instance has read (for the close-block hook). */
    public function usedParameterKeys(): array
    {
        return array_keys($this->usedKeys);
    }

    /** A fresh adapter instance is used per run; reset when reusing one. */
    public function resetUsage(): void
    {
        $this->usedKeys = [];
    }

    public function socialExemption(array $component, float $amount, ParameterSet $params): float
    {
        return $this->exemption($component, $amount, $params, 'cnss');
    }

    public function taxExemption(array $component, float $amount, ParameterSet $params): float
    {
        return $this->exemption($component, $amount, $params, 'ir');
    }

    /**
     * The two exemption tables (§6.3) are applied independently.
     * A component subject to the table contributes nothing; a
     * non-subject component is exempt up to the smallest applicable
     * cap (catalog cap, then the statutory cap for recognised codes).
     */
    private function exemption(array $component, float $amount, ParameterSet $params, string $table): float
    {
        $subjectKey = $table === 'cnss' ? 'cnss_subject' : 'ir_subject';
        if (($component[$subjectKey] ?? true) === true) {
            return 0.0;
        }

        $code = (string) ($component['code'] ?? '');

        // CNSS internship cliff (arrêté 1314-25): above the 6,000 DH
        // cap the WHOLE allowance becomes contributory — unlike a cap,
        // there is no exempt part left.
        if ($table === 'cnss' && $code === 'internship_allowance') {
            return $amount > $this->param($params, 'cnss.exempt.internship_cap') ? 0.0 : $amount;
        }

        $caps = [];
        $catalogCap = $this->catalogCap($component, $params);
        if ($catalogCap !== null) {
            $caps[] = $catalogCap;
        }
        $statutoryCap = $this->statutoryCap($code, $params, $table);
        if ($statutoryCap !== null) {
            $caps[] = $statutoryCap;
        }
        if ($caps === []) {
            return $amount;
        }

        return min($amount, min($caps));
    }

    /**
     * The catalog cap for a component. cap_type comes from the tenant's
     * component catalog (§7.5); cap_value is the DH cap for the period,
     * pre-computed by the salary structure from the base, the days, or
     * the statutory rate — except 'smig_multiple', where cap_value is
     * the multiple and the DH cap is multiple × SMIG hourly.
     */
    private function catalogCap(array $component, ParameterSet $params): ?float
    {
        $capType = $component['cap_type'] ?? 'none';
        $capValue = $component['cap_value'] ?? null;
        if ($capType === 'none' || $capType === null || $capValue === null) {
            return null;
        }
        if ($capType === 'smig_multiple') {
            return (float) $capValue * $this->param($params, 'smig.hourly');
        }

        // fixed_period, fixed_year, pct_base, per_km, per_day: the
        // catalog carries the DH cap for the period.
        return (float) $capValue;
    }

    /**
     * Statutory caps for the recognised component codes of the Morocco
     * suggested catalog (§6.3). Unrecognised codes get no statutory
     * cap (the catalog cap alone applies). 'meal_vouchers' is
     * deliberately absent: its per-day / 20%-of-gross rules need days
     * and gross, which the hooks do not receive (see class notes).
     */
    private function statutoryCap(string $code, ParameterSet $params, string $table): ?float
    {
        $prefix = $table === 'cnss' ? 'cnss.exempt.' : 'ir.exempt.';

        return match (true) {
            $code === 'transport_urban' => $this->param($params, $prefix.'transport.urban'),
            $code === 'transport_non_urban' => $this->param($params, $prefix.'transport.non_urban'),
            // Plain 'transport' defaults to the urban cap (the lower,
            // conservative figure); use the explicit codes for the
            // 750 DH outside-urban zone.
            $code === 'transport' => $this->param($params, $prefix.'transport.urban'),
            $code === 'travel_flat_rate' => $this->param($params, $prefix.'travel_flat_rate.cap'),
            $code === 'dismissal_indemnity' => $this->param($params, $prefix.'dismissal_cap'),
            $code === 'voluntary_departure' && $table === 'cnss' => $this->param($params, 'cnss.exempt.voluntary_departure.smig_multiple') * $this->param($params, 'smig.hourly'),
            $code === 'voluntary_departure' => $this->param($params, 'ir.exempt.dismissal_cap'),
            $code === 'family_event_bonus' => $this->param($params, $prefix.'social_event_bonus.year'),
            $code === 'internship_allowance' && $table === 'ir' => $this->param($params, 'ir.exempt.internship_cap'),
            $code === 'tournee_bonus' => $this->param($params, $prefix.'tournee_bonus.month'),
            $code === 'allowance_caisse' && $table === 'cnss' => $this->param($params, 'cnss.exempt.allowance_caisse.smig_multiple') * $this->param($params, 'smig.hourly'),
            $code === 'allowance_lait' && $table === 'cnss' => $this->param($params, 'cnss.exempt.allowance_lait.smig_multiple') * $this->param($params, 'smig.hourly'),
            $code === 'allowance_outillage' && $table === 'cnss' => $this->param($params, 'cnss.exempt.allowance_outillage.smig_multiple') * $this->param($params, 'smig.hourly'),
            $code === 'allowance_salissure' && $table === 'cnss' => $this->param($params, 'cnss.exempt.allowance_salissure.smig_multiple') * $this->param($params, 'smig.hourly'),
            default => null,
        };
    }

    public function contributionBranches(ParameterSet $params): array
    {
        $ceiling = $this->param($params, 'cnss.ceiling');
        // AMO employer 4.11% already includes the 1.85% solidarity
        // component — never add it again. The solidarity-only rate is
        // used only when the client flag is set (see class notes).
        $amoEmployer = $this->amoPartialExemption
            ? $this->param($params, 'amo.employer.solidarity_only')
            : $this->param($params, 'amo.employer');

        return [
            // Family allowances: employer only, no ceiling.
            ['key' => 'cnss_family', 'employee_rate' => 0.0, 'employer_rate' => $this->param($params, 'cnss.family.employer'), 'ceiling' => null],
            // Short-term (incl. IPE — do NOT add a separate IPE branch)
            // and long-term: capped at the CNSS ceiling.
            ['key' => 'cnss_short_term', 'employee_rate' => $this->param($params, 'cnss.short_term.employee'), 'employer_rate' => $this->param($params, 'cnss.short_term.employer'), 'ceiling' => $ceiling],
            ['key' => 'cnss_long_term', 'employee_rate' => $this->param($params, 'cnss.long_term.employee'), 'employer_rate' => $this->param($params, 'cnss.long_term.employer'), 'ceiling' => $ceiling],
            // AMO: no ceiling.
            ['key' => 'amo', 'employee_rate' => $this->param($params, 'amo.employee'), 'employer_rate' => $amoEmployer, 'ceiling' => null],
            // TFP: employer only, no ceiling.
            ['key' => 'tfp', 'employee_rate' => 0.0, 'employer_rate' => $this->param($params, 'tfp.employer'), 'ceiling' => null],
        ];
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

        // Uplift multipliers are parameters (V-10: confirm against
        // Labour Code art. 201). They are hours × rate × multiplier.
        return $normal * $rate * $this->param($params, 'overtime.uplift.normal')
            + $night * $rate * $this->param($params, 'overtime.uplift.night')
            + $holiday * $rate * $this->param($params, 'overtime.uplift.holiday');
    }

    /**
     * SBI → SNI (BRD §6.4 steps 5–7). $taxBase is gross minus the
     * profile's tax exemptions (computed by the core); the employee
     * social contributions (CNSS + AMO) are deductible in full.
     * The frais-professionnels abatement is computed on the annualised
     * taxable gross: 35% up to the threshold, else 25%, capped
     * annually; the monthly abatement is the annual figure ÷ 12.
     */
    public function taxableIncome(float $taxBase, float $employeeContributions, array $context, ParameterSet $params): array
    {
        $sbi = $taxBase;
        $annualTaxableGross = $sbi * 12;
        $threshold = $this->param($params, 'ir.frais_pro.threshold');
        $rate = $annualTaxableGross <= $threshold
            ? $this->param($params, 'ir.frais_pro.rate_low')
            : $this->param($params, 'ir.frais_pro.rate_high');
        $abatementAnnual = min($rate * $annualTaxableGross, $this->param($params, 'ir.frais_pro.cap'));
        $abatementAnnual = max($abatementAnnual, 0.0);
        $abatementMonth = $abatementAnnual / 12;

        // Returned lines are rounded here (D-04): the core rounds them
        // again, and rounding twice is idempotent for these values.
        return [
            'taxable_income' => $this->roundMoney($sbi - $employeeContributions - $abatementMonth),
            'sbi' => $this->roundMoney($sbi),
            'abatements' => [['key' => 'frais_professionnels', 'amount' => $this->roundMoney($abatementMonth)]],
        ];
    }

    /**
     * Monthly IR withholding (BRD §6.4 step 8): the monthly SNI is
     * annualised, the annual scale is applied (bracket rate on the
     * annual figure minus the bracket deduction, divided by 12), then
     * the family reduction (per dependant, capped at the parameter's
     * person cap, divided by 12) is deducted from the tax — floored
     * at 0. Brackets are discovered from the parameter set (no
     * literal count); the bracket is the highest one whose inclusive
     * lower bound the annual SNI reaches. Bounds are continuous
     * (0 / 40,000 / 60,000 / 80,000 / 100,000 / 180,000) — the
     * table's "40,001" is the first whole-dirham value above 40,000.
     */
    public function computeTax(float $netTaxable, array $context, ParameterSet $params): array
    {
        $dependants = (int) ($context['dependants'] ?? 0);
        $sniAnnual = $netTaxable * 12;
        $details = ['sni_annual' => $this->roundMoney($sniAnnual), 'dependants' => $dependants];

        if ($sniAnnual <= 0) {
            return ['tax' => 0.0, 'details' => array_merge($details, [
                'bracket' => null, 'rate' => 0.0, 'deduction' => 0.0,
                'gross_tax_month' => 0.0, 'family_reduction_month' => 0.0,
            ])];
        }
        $bracket = null;
        for ($i = 1; $params->has("ir.bracket.{$i}.rate"); $i++) {
            $min = $this->param($params, "ir.bracket.{$i}.min");
            if ($sniAnnual >= $min) {
                $bracket = $i;
            }
        }
        if ($bracket === null) {
            throw MissingPayrollParameterException::forKey('ir.bracket.1.rate');
        }

        $rate = $this->param($params, "ir.bracket.{$bracket}.rate");
        $deduction = $this->param($params, "ir.bracket.{$bracket}.deduction");
        $grossTaxMonth = max(($sniAnnual * $rate - $deduction) / 12, 0.0);
        $capPersons = (int) $this->param($params, 'ir.family_cap_persons');
        $perPerson = $this->param($params, 'ir.family_per_person');
        $familyMonth = min($dependants, $capPersons) * $perPerson / 12;
        $tax = max($grossTaxMonth - $familyMonth, 0.0);

        // Returned lines are rounded here (D-04): the details are
        // passed through to the snapshot unrounded by the core, so the
        // adapter rounds them itself. Rounding twice is idempotent.
        return ['tax' => $this->roundMoney($tax), 'details' => array_merge($details, [
            'bracket' => $bracket, 'rate' => $rate, 'deduction' => $deduction,
            'gross_tax_month' => $this->roundMoney($grossTaxMonth),
            'family_reduction_month' => $this->roundMoney($familyMonth),
        ])];
    }

    public function minimumWage(ParameterSet $params): ?float
    {
        return $this->param($params, 'smig.hourly');
    }

    /** The 12 mandatory payslip mentions (arrêté 346-05, BRD §10.2). */
    public function mandatoryPayslipMentions(): array
    {
        return [
            'employer_identity_cnss', // employer identification + CNSS affiliation number
            'employee_identity_cnss', // employee identification + CNSS registration number
            'professional_category',
            'hiring_date',
            'paid_working_time', // hours at normal rate + overtime with uplifts + days
            'salary_days',
            'bonuses', // nature and amount of each bonus added to basic salary
            'benefits_in_kind', // value, if any
            'gross_salary',
            'deductions', // type and amount of each deduction
            'net_salary',
            'issue_date',
        ];
    }

    /**
     * Extra per-country run checks. $runContext carries 'employee'
     * (cnss_number, hired_at) and 'jurisdiction_status' when the run
     * service knows them; with an empty context there is nothing to
     * check. A disabled jurisdiction is blocking: P3 must refuse to
     * calculate when this check fires.
     */
    public function validationChecks(array $runContext): array
    {
        $checks = [];

        if (array_key_exists('jurisdiction_status', $runContext) && $runContext['jurisdiction_status'] !== 'enabled') {
            $checks[] = ['code' => 'ma.jurisdiction.disabled', 'message' => 'The Morocco profile is not enabled for this tenant.', 'blocking' => true];
        }

        $employee = $runContext['employee'] ?? [];
        if ($employee !== []) {
            if (empty($employee['cnss_number'])) {
                $checks[] = ['code' => 'ma.cnss_number.missing', 'message' => 'The employee has no CNSS number.', 'blocking' => true];
            }
            if (empty($employee['hired_at'])) {
                $checks[] = ['code' => 'ma.hired_at.missing', 'message' => 'The employee has no hiring date.', 'blocking' => true];
            }
        }

        return $checks;
    }

    /** The export formats Morocco requires (BRD §6.6). P5 builds them. */
    public function reportingPack(): array
    {
        return [
            ['key' => 'bds', 'name' => 'BDS — bordereau de déclaration des salaires (CNSS, monthly, via Damancom)'],
            ['key' => 'ir_summary', 'name' => 'IR withholding summary (monthly, via SIMPL)'],
            ['key' => 'etat_9421', 'name' => 'État 9421 — annual declaration of treatments and salaries (before 1 March)'],
        ];
    }

    /** Read one parameter, recording it as used (close-block hook). */
    private function param(ParameterSet $params, string $key): float
    {
        $this->usedKeys[$key] = true;

        return $params->getFloat($key);
    }

    /** Decision D-04: round half-up to 0.01 at each line. */
    private function roundMoney(float $value): float
    {
        return round($value, 2, PHP_ROUND_HALF_UP);
    }
}
