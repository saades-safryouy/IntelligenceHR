<?php

namespace App\Services\Payroll;

use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\PayrollClientConfig;
use App\Models\PayrollPayslip;
use App\Models\PayrollRun;
use App\Models\PayrollSalaryComponent;
use App\Models\PayrollSalaryStructure;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Payroll run lifecycle (BRD §3.4, §8.1, §9.2, §12.3 step 3b).
 *
 * State machine (P3): draft → calculated → validated → approved →
 * closed. Send-back returns any non-closed state to draft, with a
 * reason. The BRD's §8.1 table writes the machine shorthand as
 * Draft → Validated → Approved → Closed; `calculated` is the extra
 * state the calculate endpoint produces, and validate requires it.
 *
 * Rules enforced here (in the service, not just the UI):
 * - FR-20: one run per period per scope (a second normal run for the
 *   same tenant + period + scope is rejected, whatever its status —
 *   corrections to a closed period are rectifying runs, P5).
 * - D-01: the approver must differ from the user who calculated and
 *   from the user who validated the run (read from the audit log).
 * - §12.3 step 3b: a run whose calculation used ANY parameter with
 *   confidence != official/confirmed MUST NOT close (422 naming the
 *   unvalidated keys).
 * - D-16: a disabled jurisdiction blocks calculation — never
 *   auto-enabled.
 * - FR-22: validation checks (blocking unless noted) run at validate
 *   time; the same checks are exposed read-only for the run detail UI.
 *
 * The pure rule methods (static) are unit-testable without a
 * database; the orchestration methods use Eloquent and are verified
 * live. Audit logging lives in the controllers (Controller::logAudit)
 * — the service only READS the audit log (for D-01) and exposes the
 * action names the controllers log with.
 */
final class PayrollRunService
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_CALCULATED = 'calculated';
    public const STATUS_VALIDATED = 'validated';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_CLOSED = 'closed';

    public const AUDIT_CREATED = 'payroll.run.created';
    public const AUDIT_CALCULATED = 'payroll.run.calculated';
    public const AUDIT_VALIDATED = 'payroll.run.validated';
    public const AUDIT_APPROVED = 'payroll.run.approved';
    public const AUDIT_CLOSED = 'payroll.run.closed';
    public const AUDIT_SENT_BACK = 'payroll.run.sent_back';

    /** Component code the seniority bonus is posted under (D-09). */
    public const SENIORITY_COMPONENT_CODE = 'seniority';

    /** Jurisdiction codes the service can calculate in P3. */
    private const SUPPORTED_JURISDICTIONS = ['MA'];

    public function __construct(
        private readonly PayrollParameterLoader $loader,
    ) {}

    // ------------------------------------------------------------------
    // Pure rules (no DB) — unit-tested in PayrollRunServiceTest.
    // ------------------------------------------------------------------

    /** Allowed transitions from each state (send-back is `draft`). */
    public static function allowedTransitions(): array
    {
        return [
            self::STATUS_DRAFT => [self::STATUS_CALCULATED],
            self::STATUS_CALCULATED => [self::STATUS_VALIDATED, self::STATUS_DRAFT],
            self::STATUS_VALIDATED => [self::STATUS_APPROVED, self::STATUS_DRAFT],
            self::STATUS_APPROVED => [self::STATUS_CLOSED, self::STATUS_DRAFT],
            self::STATUS_CLOSED => [],
        ];
    }

    public static function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::allowedTransitions()[$from] ?? [], true);
    }

    /**
     * FR-20: $existingRuns are the tenant's normal runs for the same
     * period + scope (each: period_year, period_month, scope_type,
     * scope_id, type). Returns an error message when a duplicate
     * exists, null otherwise.
     */
    public static function checkDuplicateRun(array $existingRuns, int $year, int $month, string $scopeType, ?string $scopeId): ?string
    {
        foreach ($existingRuns as $existing) {
            if ((int) ($existing['period_year'] ?? 0) !== $year
                || (int) ($existing['period_month'] ?? 0) !== $month
                || (string) ($existing['scope_type'] ?? '') !== $scopeType
                || (string) ($existing['scope_id'] ?? '') !== (string) ($scopeId ?? '')
                || (string) ($existing['type'] ?? 'normal') !== 'normal') {
                continue;
            }

            $status = (string) ($existing['status'] ?? 'draft');
            $scope = $scopeType === 'department' ? "department {$scopeId}" : 'all employees';

            return $status === self::STATUS_CLOSED
                ? "A run for {$year}-".str_pad((string) $month, 2, '0', STR_PAD_LEFT)." ({$scope}) is already closed. Corrections go through a rectifying run, not a new normal run."
                : "An open run already exists for {$year}-".str_pad((string) $month, 2, '0', STR_PAD_LEFT)." ({$scope}, status: {$status}). Only one run per period per scope may be open at a time (FR-20).";
        }

        return null;
    }

    /**
     * D-01 separation of duties: the approver must be a different
     * person than the user who calculated and than the user who
     * validated the run. $calculatedBy / $validatedBy are the user ids
     * from the audit log (null when the log has no entry — e.g. the
     * run predates audit logging — in which case there is nothing to
     * compare against and approval is allowed). Returns an error
     * message, or null when the approver may approve.
     */
    public static function checkApprover(?string $calculatedBy, ?string $validatedBy, string $approverId): ?string
    {
        if ($calculatedBy !== null && $calculatedBy === $approverId) {
            return 'Separation of duties (D-01): the user who calculated this run cannot approve it. A different hr-admin must approve.';
        }
        if ($validatedBy !== null && $validatedBy === $approverId) {
            return 'Separation of duties (D-01): the user who validated this run cannot approve it. A different hr-admin must approve.';
        }

        return null;
    }

    /**
     * §12.3 step 3b (close-block): the keys a calculation actually
     * used whose confidence is not official/confirmed. Empty means
     * the run may close.
     */
    public static function checkCloseBlock(array $usedKeys, ParameterSet $parameters): array
    {
        return $parameters->unvalidatedKeys(array_values(array_unique($usedKeys)));
    }

    /** D-16: a jurisdiction that is not 'enabled' blocks calculation. */
    public static function checkJurisdictionEnabled(?string $status): ?string
    {
        if ($status === 'enabled') {
            return null;
        }

        return $status === null
            ? 'This jurisdiction is not installed for this tenant. A platform admin must enable it before any run can be calculated (D-16).'
            : "This jurisdiction is '{$status}' for this tenant. Calculation is blocked until a platform admin enables it (D-16) — it is never auto-enabled.";
    }

    /**
     * D-09 seniority rate table: $bands are [['min_years' => int,
     * 'rate' => float]] (rate as a fraction of base salary, e.g.
     * 0.05 = 5%). The band with the highest min_years not above the
     * employee's years of service wins; no matching band → 0.
     * Malformed bands (negative years, rate outside (0, 1]) are
     * ignored, never applied.
     */
    public static function seniorityRate(array $bands, int $yearsOfService): float
    {
        $rate = 0.0;
        $bestMinYears = -1;
        foreach ($bands as $band) {
            $minYears = (int) ($band['min_years'] ?? -1);
            $bandRate = (float) ($band['rate'] ?? 0);
            if ($minYears < 0 || $bandRate <= 0 || $bandRate > 1) {
                continue;
            }
            if ($minYears <= $yearsOfService && $minYears > $bestMinYears) {
                $bestMinYears = $minYears;
                $rate = $bandRate;
            }
        }

        return $rate;
    }

    /** Full years between a hiring date and a period start date. */
    public static function yearsOfService(?string $joinedAt, string $periodStart): int
    {
        if ($joinedAt === null || $joinedAt === '') {
            return 0;
        }
        $start = new \DateTimeImmutable($joinedAt);
        $end = new \DateTimeImmutable($periodStart);

        return $start > $end ? 0 : $start->diff($end)->y;
    }

    /** Monthly minimum wage (D-04 rounding) or null when the profile defines none. */
    public static function minimumWageMonthly(?float $hourly, float $contractualHours): ?float
    {
        if ($hourly === null || $contractualHours <= 0) {
            return null;
        }

        return round($hourly * $contractualHours, 2, PHP_ROUND_HALF_UP);
    }

    /**
     * Year-to-date cumulations from earlier payslips of the same
     * calendar year (BRD §7.8 `ytd`): sums gross, employee social
     * contributions and IR from each snapshot's computation block.
     * $snapshots are calculation_json arrays.
     */
    public static function accumulateYtd(array $snapshots): array
    {
        $gross = 0.0;
        $cnssEmployee = 0.0;
        $ir = 0.0;
        foreach ($snapshots as $snapshot) {
            $computation = is_array($snapshot) ? ($snapshot['computation'] ?? []) : [];
            $gross = round($gross + (float) ($computation['gross'] ?? 0), 2, PHP_ROUND_HALF_UP);
            $cnssEmployee = round($cnssEmployee + (float) ($computation['contributions']['employee']['total'] ?? 0), 2, PHP_ROUND_HALF_UP);
            $ir = round($ir + (float) ($computation['tax']['amount'] ?? 0), 2, PHP_ROUND_HALF_UP);
        }

        return ['gross' => $gross, 'cnss_employee' => $cnssEmployee, 'ir' => $ir];
    }

    // ------------------------------------------------------------------
    // Orchestration (Eloquent) — verified live, not by unit tests.
    // ------------------------------------------------------------------

    public function adapterFor(string $jurisdictionCode): JurisdictionAdapterInterface
    {
        if ($jurisdictionCode === 'MA') {
            return new MoroccoPayrollAdapter;
        }

        throw ValidationException::withMessages([
            'jurisdiction_code' => "Jurisdiction '{$jurisdictionCode}' is not supported in P3 (only MA).",
        ]);
    }

    /** The tenant's current client config (highest version, in force today), or null. */
    public function currentClientConfig(int $tenantId): ?PayrollClientConfig
    {
        $today = now()->toDateString();

        return PayrollClientConfig::query()
            ->where('tenant_id', $tenantId)
            ->where('effective_from', '<=', $today)
            ->where(function ($query) use ($today) {
                $query->whereNull('effective_to')->orWhere('effective_to', '>=', $today);
            })
            ->orderBy('version', 'desc')
            ->first();
    }

    /**
     * Component-catalog version marker: the unix timestamp of the
     * latest catalog change. It is a change marker, not a sequential
     * version — any catalog edit moves it, so a run's snapshot can
     * tell whether the catalog has changed since.
     */
    public function componentCatalogVersion(int $tenantId): ?int
    {
        $max = PayrollSalaryComponent::query()->where('tenant_id', $tenantId)->max('updated_at');

        return $max ? (int) strtotime((string) $max) : null;
    }

    /**
     * Create a draft run. The tenant always comes from the
     * authenticated user (D-15) — never from the request.
     */
    public function createRun(User $user, array $input): PayrollRun
    {
        $tenantId = $user->tenant_id;
        if ($tenantId === null) {
            throw ValidationException::withMessages([
                'tenant' => 'Runs belong to a tenant. A platform admin has no tenant of their own — switch to a tenant first.',
            ]);
        }

        $year = (int) ($input['period_year'] ?? 0);
        $month = (int) ($input['period_month'] ?? 0);
        $scopeType = (string) ($input['scope_type'] ?? 'all');
        $scopeId = isset($input['scope_id']) && $input['scope_id'] !== '' ? (string) $input['scope_id'] : null;
        $jurisdiction = strtoupper((string) ($input['jurisdiction_code'] ?? 'MA'));

        if ($year < 2020 || $year > 2100 || $month < 1 || $month > 12) {
            throw ValidationException::withMessages(['period' => 'period_year/period_month must be a valid month (2020-01 … 2100-12).']);
        }
        if (! in_array($jurisdiction, self::SUPPORTED_JURISDICTIONS, true)) {
            throw ValidationException::withMessages(['jurisdiction_code' => "Jurisdiction '{$jurisdiction}' is not supported in P3 (only MA)."]);
        }
        if (! in_array($scopeType, ['all', 'department'], true)) {
            throw ValidationException::withMessages(['scope_type' => "scope_type must be 'all' or 'department'."]);
        }
        if ($scopeType === 'department' && $scopeId === null) {
            throw ValidationException::withMessages(['scope_id' => 'scope_id (department id) is required when scope_type is department.']);
        }

        // FR-20 — one run per period per scope.
        $existing = PayrollRun::query()
            ->where('tenant_id', $tenantId)
            ->where('period_year', $year)
            ->where('period_month', $month)
            ->where('scope_type', $scopeType)
            ->where('scope_id', $scopeId)
            ->get()
            ->map(fn (PayrollRun $run) => $run->only(['period_year', 'period_month', 'scope_type', 'scope_id', 'type', 'status']))
            ->all();
        $duplicate = self::checkDuplicateRun($existing, $year, $month, $scopeType, $scopeId);
        if ($duplicate !== null) {
            throw ValidationException::withMessages(['period' => $duplicate]);
        }

        $periodStart = sprintf('%04d-%02d-01', $year, $month);
        $periodEnd = date('Y-m-t', strtotime($periodStart));
        $adapter = $this->adapterFor($jurisdiction);
        $profileVersion = $this->loader->profileVersionForTenant($tenantId, $jurisdiction)
            ?? $adapter->profileVersion();
        $config = $this->currentClientConfig($tenantId);

        return PayrollRun::create([
            'tenant_id' => $tenantId,
            'jurisdiction_code' => $jurisdiction,
            'jurisdiction_profile_version' => $profileVersion,
            'client_config_version' => $config?->version,
            'component_catalog_version' => $this->componentCatalogVersion($tenantId),
            'period_year' => $year,
            'period_month' => $month,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'scope_type' => $scopeType,
            'scope_id' => $scopeId,
            'status' => self::STATUS_DRAFT,
            'type' => 'normal',
            'totals' => null,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);
    }

    /**
     * (Re-)calculate a draft run. $overtimeByEmployee maps employee id
     * (or string id) to ['normal_hours','night_hours','holiday_hours']
     * — manual entry, decision D-10. Employees without an active
     * salary structure at the period start are skipped and reported
     * in totals (they block validation, FR-22, but not calculation).
     * The full calculation_json snapshot (§7.8) is stored per
     * payslip, plus the used parameter keys (close-block hook).
     */
    public function calculateRun(PayrollRun $run, User $user, array $overtimeByEmployee = []): PayrollRun
    {
        if (! in_array($run->status, [self::STATUS_DRAFT, self::STATUS_CALCULATED], true)) {
            throw ValidationException::withMessages([
                'status' => "Only a draft (or already calculated) run can be (re-)calculated. Send the run back to draft first (current status: {$run->status}).",
            ]);
        }

        $jurisdiction = $run->jurisdiction_code ?? 'MA';
        $adapter = $this->adapterFor($jurisdiction);

        // D-16 — a disabled jurisdiction blocks calculation, and is
        // never auto-enabled here.
        $statusError = self::checkJurisdictionEnabled(
            $this->loader->jurisdictionStatusForTenant($run->tenant_id, $jurisdiction)
        );
        if ($statusError !== null) {
            throw ValidationException::withMessages(['jurisdiction' => $statusError]);
        }

        $periodStart = $run->period_start->format('Y-m-d');
        $params = $this->loader->load($jurisdiction, $run->jurisdiction_profile_version ?? $adapter->profileVersion(), $periodStart);
        $config = $this->configForRun($run);
        $clientSettings = $config?->settings_json ?? [];
        if (($clientSettings['payroll']['amo_partial_exemption'] ?? false) === true
            && $adapter instanceof MoroccoPayrollAdapter) {
            // §6.1 / art. 114 loi 65-00: employer pays only the 1.85%
            // solidarity contribution when they already had group
            // medical cover. Wired from the client config (§4.1).
            $adapter->setAmoPartialExemption(true);
        }
        $calculator = new PayrollCalculator($adapter);

        $catalog = PayrollSalaryComponent::query()
            ->where('tenant_id', $run->tenant_id)
            ->where('active', true)
            ->get()
            ->map(fn (PayrollSalaryComponent $component) => [
                'code' => $component->code,
                'category' => $component->category,
                'cnss_subject' => (bool) $component->cnss_subject,
                'ir_subject' => (bool) $component->ir_subject,
                'cap_type' => $component->cap_type,
                'cap_value' => $component->cap_value !== null ? (float) $component->cap_value : null,
                'counts_toward_tax_abatement' => (bool) $component->counts_toward_tax_abatement,
            ])->all();

        $employees = $this->employeesInScope($run);
        $period = sprintf('%04d-%02d', $run->period_year, $run->period_month);
        $seniorityBands = $clientSettings['payroll']['seniority_bands'] ?? [];

        $snapshots = [];
        $missingStructures = [];
        $totals = [
            'employees_calculated' => 0,
            'employees_missing_structure' => 0,
            'gross_total' => 0.0,
            'net_total' => 0.0,
            'employee_contributions_total' => 0.0,
            'employer_contributions_total' => 0.0,
            'tax_total' => 0.0,
            'employer_cost_total' => 0.0,
        ];

        foreach ($employees as $employee) {
            $structure = $this->activeStructure($run->tenant_id, (int) $employee->id, $periodStart);
            if ($structure === null) {
                $missingStructures[] = $employee;
                continue;
            }

            $lines = $structure->lines()->get()->map(fn ($line) => [
                'component' => $line->component_code,
                'amount' => (float) $line->amount,
            ])->all();

            // D-09: seniority bonus from the client-config rate table
            // (BRD §4.2 compensation policies). The bonus is a run-time
            // line on the payslip, not a stored structure line.
            $years = self::yearsOfService(
                $employee->joined_at?->format('Y-m-d'),
                $periodStart
            );
            $seniorityRate = self::seniorityRate(is_array($seniorityBands) ? $seniorityBands : [], $years);
            if ($seniorityRate > 0) {
                $lines[] = [
                    'component' => self::SENIORITY_COMPONENT_CODE,
                    'amount' => round((float) $structure->base_salary * $seniorityRate, 2, PHP_ROUND_HALF_UP),
                ];
            }

            $overtimeInput = $overtimeByEmployee[$employee->id] ?? $overtimeByEmployee[(string) $employee->id] ?? [];
            $contractualHours = (float) ($structure->contractual_hours_month ?? 191);
            $hourlyRate = $contractualHours > 0
                ? (float) $structure->base_salary / $contractualHours
                : 0.0;

            $dependants = (int) ($employee->dependants_count ?? 0)
                + (! empty($employee->spouse_dependent) ? 1 : 0);

            $inputs = [
                'tenant_id' => $run->tenant_id,
                'period' => $period,
                'employee' => [
                    'id' => $employee->id,
                    'cnss_number' => $employee->cnss_number,
                    'category' => $employee->job_title ?? $employee->position_title,
                    'hired_at' => $employee->joined_at?->format('Y-m-d'),
                    'dependants' => $dependants,
                ],
                'base_salary' => (float) $structure->base_salary,
                'lines' => $lines,
                'overtime' => [
                    'normal_hours' => (float) ($overtimeInput['normal_hours'] ?? 0),
                    'night_hours' => (float) ($overtimeInput['night_hours'] ?? 0),
                    'holiday_hours' => (float) ($overtimeInput['holiday_hours'] ?? 0),
                    'hourly_rate' => $hourlyRate,
                ],
                'deductions' => [],
                'versions' => [
                    'parameter_set_id' => $params->id,
                    'client_config_version' => $run->client_config_version,
                    'component_catalog_version' => $run->component_catalog_version,
                ],
            ];

            $adapter->resetUsage();
            $snapshot = $calculator->calculate($inputs, $catalog, $clientSettings, $params);
            // Additive to the §7.8 shape: the keys this calculation
            // actually read, for the close-block (§12.3 step 3b).
            $snapshot['used_parameter_keys'] = $adapter->usedParameterKeys();
            // YTD from earlier payslips of the same calendar year.
            $snapshot['ytd'] = self::accumulateYtd(
                PayrollPayslip::query()
                    ->where('tenant_id', $run->tenant_id)
                    ->where('employee_id', $employee->id)
                    ->where('period_year', $run->period_year)
                    ->where('period_month', '<', $run->period_month)
                    ->pluck('calculation_json')
                    ->all()
            );

            $snapshots[] = ['employee_id' => $employee->id, 'snapshot' => $snapshot];
            $computation = $snapshot['computation'];
            $totals['employees_calculated']++;
            $totals['gross_total'] = round($totals['gross_total'] + (float) $computation['gross'], 2, PHP_ROUND_HALF_UP);
            $totals['net_total'] = round($totals['net_total'] + (float) $computation['net'], 2, PHP_ROUND_HALF_UP);
            $totals['employee_contributions_total'] = round($totals['employee_contributions_total'] + (float) $computation['contributions']['employee']['total'], 2, PHP_ROUND_HALF_UP);
            $totals['employer_contributions_total'] = round($totals['employer_contributions_total'] + (float) $computation['contributions']['employer']['total'], 2, PHP_ROUND_HALF_UP);
            $totals['tax_total'] = round($totals['tax_total'] + (float) $computation['tax']['amount'], 2, PHP_ROUND_HALF_UP);
            $totals['employer_cost_total'] = round($totals['employer_cost_total'] + (float) $computation['employer_cost'], 2, PHP_ROUND_HALF_UP);
        }
        $totals['employees_missing_structure'] = count($missingStructures);

        DB::transaction(function () use ($run, $user, $snapshots, $totals) {
            // Re-calculation replaces the previous payslips (the run
            // keeps only the latest calculation).
            $run->payslips()->delete();
            foreach ($snapshots as $entry) {
                PayrollPayslip::create([
                    'tenant_id' => $run->tenant_id,
                    'payroll_run_id' => $run->id,
                    'employee_id' => $entry['employee_id'],
                    'period_year' => $run->period_year,
                    'period_month' => $run->period_month,
                    'calculation_json' => $entry['snapshot'],
                    'pdf_path' => null,
                ]);
            }
            $run->totals = array_merge($run->totals ?? [], $totals);
            $run->status = self::STATUS_CALCULATED;
            $run->updated_by = $user->id;
            $run->save();
        });

        return $run->fresh();
    }

    /**
     * FR-22 validation checks for a run, for the validate endpoint
     * and the run detail UI. Returns ['blocking' => [...], 'warnings'
     * => [...], 'employees_checked' => int, 'payslips_checked' => int].
     * Each check: ['code', 'message', 'blocking', 'employee_id'?,
     * 'employee_name'?]. Minimum-wage overrides recorded on the run
     * (totals.minimum_wage_overrides: {employee_id: reason}) downgrade
     * that employee's minimum-wage check to a warning.
     */
    public function validationResults(PayrollRun $run): array
    {
        $blocking = [];
        $warnings = [];
        $employees = $this->employeesInScope($run);
        $payslips = $run->payslips()->get()->keyBy('employee_id');
        $periodStart = $run->period_start->format('Y-m-d');
        $overrides = $run->totals['minimum_wage_overrides'] ?? [];
        $adapter = $this->adapterFor($run->jurisdiction_code ?? 'MA');
        $params = $this->loader->load(
            $run->jurisdiction_code ?? 'MA',
            $run->jurisdiction_profile_version ?? $adapter->profileVersion(),
            $periodStart
        );
        $jurisdictionStatus = $this->loader->jurisdictionStatusForTenant($run->tenant_id, $run->jurisdiction_code ?? 'MA');
        $minimumHourly = $adapter->minimumWage($params);

        // Profile-level checks (jurisdiction enablement).
        foreach ($adapter->validationChecks(['jurisdiction_status' => $jurisdictionStatus]) as $check) {
            ($check['blocking'] ?? false ? $blocking : $warnings)[] = [
                'code' => $check['code'],
                'message' => $check['message'],
                'blocking' => (bool) ($check['blocking'] ?? false),
            ];
        }

        foreach ($employees as $employee) {
            $name = $employee->fullName();
            $payslip = $payslips->get($employee->id);
            $structure = $this->activeStructure($run->tenant_id, (int) $employee->id, $periodStart);

            if ($payslip === null) {
                $blocking[] = [
                    'code' => $structure === null ? 'structure.missing' : 'employee.not_calculated',
                    'message' => $structure === null
                        ? "{$name} has no active salary structure at {$periodStart} — create one, then re-calculate the run."
                        : "{$name} has an active salary structure but no payslip in this run — re-calculate the run.",
                    'blocking' => true,
                    'employee_id' => $employee->id,
                    'employee_name' => $name,
                ];
                continue;
            }

            $snapshot = $payslip->calculation_json ?? [];
            $computation = $snapshot['computation'] ?? [];
            $gross = (float) ($computation['gross'] ?? 0);
            $net = (float) ($computation['net'] ?? 0);

            // FR-22: every payslip's net >= 0.
            if ($net < 0) {
                $blocking[] = [
                    'code' => 'payslip.net_negative',
                    'message' => "{$name}: net pay is negative ({$net} DH). Check the structure and deductions.",
                    'blocking' => true,
                    'employee_id' => $employee->id,
                    'employee_name' => $name,
                ];
            }

            // FR-22: no employee below the jurisdiction minimum wage
            // without an override reason (FR-10).
            $contractualHours = (float) ($structure?->contractual_hours_month ?? 191);
            $minimumMonthly = self::minimumWageMonthly($minimumHourly, $contractualHours);
            if ($minimumMonthly !== null && $gross < $minimumMonthly) {
                $override = $overrides[$employee->id] ?? $overrides[(string) $employee->id] ?? null;
                if ($override) {
                    $warnings[] = [
                        'code' => 'minimum_wage.override',
                        'message' => "{$name}: gross {$gross} DH is below the monthly minimum {$minimumMonthly} DH — override recorded: {$override}.",
                        'blocking' => false,
                        'employee_id' => $employee->id,
                        'employee_name' => $name,
                    ];
                } else {
                    $blocking[] = [
                        'code' => 'minimum_wage.below',
                        'message' => "{$name}: gross {$gross} DH is below the monthly minimum {$minimumMonthly} DH (SMIG {$minimumHourly} DH/h × {$contractualHours} h). Record an override reason to validate, or fix the structure.",
                        'blocking' => true,
                        'employee_id' => $employee->id,
                        'employee_name' => $name,
                    ];
                }
            }

            // Profile checks: mandatory employee data (CNSS number,
            // hiring date) — from the snapshot's employee block.
            foreach ($adapter->validationChecks(['employee' => $snapshot['employee'] ?? []]) as $check) {
                ($check['blocking'] ?? false ? $blocking : $warnings)[] = [
                    'code' => $check['code'],
                    'message' => "{$name}: {$check['message']}",
                    'blocking' => (bool) ($check['blocking'] ?? false),
                    'employee_id' => $employee->id,
                    'employee_name' => $name,
                ];
            }

            // FR-16 warnings recorded by the calculation.
            foreach ($snapshot['warnings'] ?? [] as $warning) {
                $warnings[] = [
                    'code' => 'calculation.' . ($warning['code'] ?? 'warning'),
                    'message' => "{$name}: " . ($warning['code'] === 'unknown_component'
                        ? "component '{$warning['component']}' is not in the catalog — treated as fully taxable and fully contributory."
                        : 'calculation warning: ' . json_encode($warning)),
                    'blocking' => false,
                    'employee_id' => $employee->id,
                    'employee_name' => $name,
                ];
            }

            // Adapter-known limits the exemption hooks cannot check
            // (BRD §6, Morocco adapter header): the representation
            // allowance is capped at 10% of basic salary, and meal
            // vouchers at 20% of gross. The per-day meal-voucher rule
            // (40 DH/day) needs worked days — not checkable here.
            $baseSalary = (float) ($snapshot['inputs']['base_salary'] ?? 0);
            foreach ($snapshot['inputs']['lines'] ?? [] as $line) {
                $code = (string) ($line['component'] ?? '');
                if ($code === 'representation' && (float) ($line['exempt_ir'] ?? 0) > round($baseSalary * 0.10, 2, PHP_ROUND_HALF_UP)) {
                    $warnings[] = [
                        'code' => 'representation.above_10pct',
                        'message' => "{$name}: representation allowance exemption exceeds 10% of basic salary ({$baseSalary} DH).",
                        'blocking' => false,
                        'employee_id' => $employee->id,
                        'employee_name' => $name,
                    ];
                }
                if ($code === 'meal_voucher' && (float) ($line['exempt_ir'] ?? 0) > round($gross * 0.20, 2, PHP_ROUND_HALF_UP)) {
                    $warnings[] = [
                        'code' => 'meal_voucher.above_20pct',
                        'message' => "{$name}: meal voucher exemption exceeds 20% of gross ({$gross} DH).",
                        'blocking' => false,
                        'employee_id' => $employee->id,
                        'employee_name' => $name,
                    ];
                }
            }
        }

        return [
            'blocking' => $blocking,
            'warnings' => $warnings,
            'employees_checked' => count($employees),
            'payslips_checked' => count($payslips),
        ];
    }

    /**
     * Validate a calculated run (FR-22 + profile checks).
     * $minimumWageOverrides maps employee id => override reason; an
     * overridden minimum-wage breach becomes a warning instead of a
     * blocker. Overrides are stored on the run's totals.
     */
    public function validateRun(PayrollRun $run, User $user, array $minimumWageOverrides = []): PayrollRun
    {
        if ($run->status !== self::STATUS_CALCULATED) {
            throw ValidationException::withMessages([
                'status' => "Only a calculated run can be validated (current status: {$run->status}). Calculate the run first.",
            ]);
        }

        $totals = $run->totals ?? [];
        $totals['minimum_wage_overrides'] = $minimumWageOverrides;
        $run->totals = $totals;
        $results = $this->validationResults($run);

        if ($results['blocking'] !== []) {
            $messages = array_map(fn (array $check) => $check['message'], $results['blocking']);
            throw ValidationException::withMessages(['validation' => $messages]);
        }

        $run->status = self::STATUS_VALIDATED;
        $run->updated_by = $user->id;
        $run->save();

        return $run->fresh();
    }

    /** Approve a validated run — D-01 separation of duties enforced. */
    public function approveRun(PayrollRun $run, User $user): PayrollRun
    {
        if ($run->status !== self::STATUS_VALIDATED) {
            throw ValidationException::withMessages([
                'status' => "Only a validated run can be approved (current status: {$run->status}).",
            ]);
        }

        $error = self::checkApprover(
            $this->lastActorFor($run, self::AUDIT_CALCULATED),
            $this->lastActorFor($run, self::AUDIT_VALIDATED),
            (string) $user->id
        );
        if ($error !== null) {
            throw ValidationException::withMessages(['approver' => $error]);
        }

        $run->status = self::STATUS_APPROVED;
        $run->updated_by = $user->id;
        $run->save();

        return $run->fresh();
    }

    /**
     * Close an approved run. §12.3 step 3b: the run must not close
     * while any parameter its calculation used is unvalidated
     * (confidence != official/confirmed). Payslips are generated from
     * the stored calculation_json at close (FR-50) — P4 renders the
     * PDF from the snapshot; P3 marks the run closed and makes the
     * payslips visible to employees.
     */
    public function closeRun(PayrollRun $run, User $user): PayrollRun
    {
        if ($run->status !== self::STATUS_APPROVED) {
            throw ValidationException::withMessages([
                'status' => "Only an approved run can be closed (current status: {$run->status}).",
            ]);
        }

        $params = $this->loader->load(
            $run->jurisdiction_code ?? 'MA',
            $run->jurisdiction_profile_version ?? $this->adapterFor($run->jurisdiction_code ?? 'MA')->profileVersion(),
            $run->period_start->format('Y-m-d')
        );

        $usedKeys = [];
        $missingUsedKeys = false;
        foreach ($run->payslips()->get() as $payslip) {
            $keys = ($payslip->calculation_json ?? [])['used_parameter_keys'] ?? null;
            if (! is_array($keys)) {
                // A payslip without the recorded keys (e.g. calculated
                // before P3 stored them): be conservative and treat
                // every parameter as used.
                $missingUsedKeys = true;
                continue;
            }
            $usedKeys = array_merge($usedKeys, $keys);
        }
        if ($missingUsedKeys) {
            $usedKeys = array_keys($params->all());
        }

        $unvalidated = self::checkCloseBlock($usedKeys, $params);
        if ($unvalidated !== []) {
            throw ValidationException::withMessages([
                'unvalidated_parameters' => 'This run cannot close: the calculation used parameters that are not validated yet (confidence is not official/confirmed): ' . implode(', ', $unvalidated) . '. Complete accountant validation (V-01…V-15) first — the parameters are still awaiting validation.',
            ]);
        }

        $run->status = self::STATUS_CLOSED;
        $run->updated_by = $user->id;
        $run->save();

        return $run->fresh();
    }

    /** Send any non-closed run back to draft, with a reason. */
    public function sendBackRun(PayrollRun $run, User $user, string $reason): PayrollRun
    {
        if ($run->status === self::STATUS_CLOSED) {
            throw ValidationException::withMessages([
                'status' => 'A closed run cannot be sent back. Corrections to a closed period go through a rectifying run (P5).',
            ]);
        }
        if (trim($reason) === '') {
            throw ValidationException::withMessages(['reason' => 'A send-back reason is required.']);
        }

        $totals = $run->totals ?? [];
        $totals['last_send_back_reason'] = trim($reason);
        $run->totals = $totals;
        $run->status = self::STATUS_DRAFT;
        $run->updated_by = $user->id;
        $run->save();

        return $run->fresh();
    }

    /**
     * The user id of the latest audit entry for a run transition, or
     * null when the audit log has no such entry. The audit log is
     * best-effort (Controller::logAudit swallows failures), so a
     * missing entry means "unknown", not "nobody".
     */
    public function lastActorFor(PayrollRun $run, string $action): ?string
    {
        $entry = AuditLog::query()
            ->where('tenant_id', $run->tenant_id)
            ->where('action', $action)
            ->where('resource_type', 'payroll_run')
            ->where('resource_id', (string) $run->id)
            ->orderBy('id', 'desc')
            ->first();

        return $entry?->user_id !== null ? (string) $entry->user_id : null;
    }

    // ------------------------------------------------------------------
    // Internal helpers.
    // ------------------------------------------------------------------

    private function configForRun(PayrollRun $run): ?PayrollClientConfig
    {
        if ($run->client_config_version !== null) {
            $config = PayrollClientConfig::query()
                ->where('tenant_id', $run->tenant_id)
                ->where('version', $run->client_config_version)
                ->first();
            if ($config !== null) {
                return $config;
            }
        }

        return $this->currentClientConfig($run->tenant_id);
    }

    /** Employees covered by a run's scope, ordered by name. */
    private function employeesInScope(PayrollRun $run)
    {
        $query = Employee::query()
            ->where('tenant_id', $run->tenant_id)
            ->orderBy('last_name')
            ->orderBy('first_name');
        if ($run->scope_type === 'department' && $run->scope_id !== null) {
            $query->where('department_id', $run->scope_id);
        }

        return $query->get();
    }

    /** The salary structure active for an employee at a date, or null. */
    private function activeStructure(int $tenantId, int $employeeId, string $at): ?PayrollSalaryStructure
    {
        return PayrollSalaryStructure::query()
            ->where('tenant_id', $tenantId)
            ->where('employee_id', $employeeId)
            ->where('effective_from', '<=', $at)
            ->where(function ($query) use ($at) {
                $query->whereNull('effective_to')->orWhere('effective_to', '>=', $at);
            })
            ->orderBy('effective_from', 'desc')
            ->orderBy('id', 'desc')
            ->first();
    }
}
