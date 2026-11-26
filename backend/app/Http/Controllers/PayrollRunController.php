<?php

namespace App\Http\Controllers;

use App\Models\PayrollPayslip;
use App\Models\PayrollRun;
use App\Models\User;
use App\Services\Payroll\MissingPayrollParameterException;
use App\Services\Payroll\PayrollRunService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Payroll run lifecycle API (BRD §8.1).
 *
 * All routes are tenant-scoped by the P1 middleware + the
 * BelongsToTenant global scope: a request for another tenant's run
 * returns 404, never 403 (§2.4). Controllers never read a tenant id
 * from the request — the tenant comes from the authenticated user
 * (D-15) via the service.
 *
 * Pay-data redaction (§9.3 rule 3): a user with payroll.run.view but
 * without payroll.payslip.view.all (e.g. hr-manager) may list runs
 * and see a run's status/scope/period, but totals, validation
 * details and payslips are withheld — those need
 * payroll.payslip.view.all.
 */
final class PayrollRunController extends Controller
{
    public function __construct(
        private readonly PayrollRunService $runs,
    ) {}

    /**
     * Resolve a run id to the model AFTER the tenant middleware has run.
     *
     * NOTE — do NOT use implicit route-model binding in this controller.
     * SubstituteBindings (in the api group) runs BEFORE auth:sanctum +
     * the tenant middleware, so at binding time the tenant is not bound
     * yet, TenantContext::mode() is 'none', and the tenant scope fails
     * closed (whereRaw '1 = 0') — every bound run/payslip 404s with
     * "No query results for model" even though the row exists and the
     * list returns it (26 Nov 2026). Resolving here, inside the method,
     * runs after the tenant is bound, so the scope matches the current
     * tenant; a foreign tenant's run still 404s (BRD §2.4: 404, never 403).
     */
    private function findRun(int $runId): PayrollRun
    {
        return PayrollRun::findOrFail($runId);
    }

    private function findPayslip(int $payslipId): PayrollPayslip
    {
        return PayrollPayslip::findOrFail($payslipId);
    }

    /** GET /payroll/runs — paged list (envelope B). */
    public function index(Request $request)
    {
        if (! $this->can('payroll.run.view')) {
            return $this->forbidden();
        }

        $page = max(1, (int) $request->input('page', 1));
        $pageSize = min(100, max(1, (int) $request->input('pageSize', 20)));
        $query = PayrollRun::query()->withCount('payslips')->orderBy('period_year', 'desc')->orderBy('period_month', 'desc');
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        $total = $query->count();
        $runs = $query->forPage($page, $pageSize)->get();
        $includePayData = $this->can('payroll.payslip.view.all');

        return response()->json([
            'data' => $runs->map(fn (PayrollRun $run) => $this->runPayload($run, $includePayData))->all(),
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $total,
        ]);
    }

    /** POST /payroll/runs — create a draft run (FR-20 enforced in the service). */
    public function store(Request $request)
    {
        if (! $this->can('payroll.run.create')) {
            return $this->forbidden();
        }

        $input = $request->validate([
            'period_year' => 'required|integer|min:2020|max:2100',
            'period_month' => 'required|integer|min:1|max:12',
            'jurisdiction_code' => 'nullable|string|max:10',
            'scope_type' => 'nullable|string|in:all,department',
            'scope_id' => 'nullable|string|max:100',
        ]);

        $run = $this->runs->createRun($this->user(), $input);
        $this->logAudit(
            PayrollRunService::AUDIT_CREATED,
            'payroll_run',
            $run->id,
            "Payroll run created for {$run->period_year}-" . str_pad((string) $run->period_month, 2, '0', STR_PAD_LEFT) . " ({$run->scope_type}" . ($run->scope_id ? " {$run->scope_id}" : '') . "), jurisdiction {$run->jurisdiction_code} v{$run->jurisdiction_profile_version}."
        );

        return response()->json(['data' => $this->runPayload($run, true)], 201);
    }

    /** GET /payroll/runs/{run} — run + totals + validation results + exceptions. */
    public function show(int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.run.view')) {
            return $this->forbidden();
        }

        $includePayData = $this->can('payroll.payslip.view.all');
        $payload = $this->runPayload($run, $includePayData);
        $payload['payslip_count'] = $run->payslips()->count();
        if ($includePayData) {
            $payload['validation'] = $this->runs->validationResults($run);
        }

        return response()->json(['data' => $payload]);
    }

    /** POST /payroll/runs/{run}/calculate — (re-)calculate the draft. */
    public function calculate(Request $request, int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.run.calculate')) {
            return $this->forbidden();
        }

        $input = $request->validate([
            'overtime' => 'nullable|array',
            'overtime.*.normal_hours' => 'nullable|numeric|min:0|max:744',
            'overtime.*.night_hours' => 'nullable|numeric|min:0|max:744',
            'overtime.*.holiday_hours' => 'nullable|numeric|min:0|max:744',
        ]);

        try {
            $run = $this->runs->calculateRun($run, $this->user(), $input['overtime'] ?? []);
        } catch (MissingPayrollParameterException $e) {
            throw ValidationException::withMessages(['parameter' => $e->getMessage()]);
        }
        $totals = $run->totals ?? [];
        $this->logAudit(
            PayrollRunService::AUDIT_CALCULATED,
            'payroll_run',
            $run->id,
            "Run {$run->period_year}-" . str_pad((string) $run->period_month, 2, '0', STR_PAD_LEFT) . " calculated: " . ($totals['employees_calculated'] ?? 0) . ' payslip(s), gross ' . number_format((float) ($totals['gross_total'] ?? 0), 2) . ' DH, net ' . number_format((float) ($totals['net_total'] ?? 0), 2) . ' DH.' . (($totals['employees_missing_structure'] ?? 0) > 0 ? ' ' . $totals['employees_missing_structure'] . ' employee(s) without a salary structure.' : '')
        );

        return response()->json(['data' => $this->runPayload($run, true)]);
    }

    // NOTE: this action must NOT be named validate() — the base Controller
    // (ValidatesRequests trait) already defines validate(Request, array
    // $rules, ...). A child validate(Request, PayrollRun) is a fatal
    // signature incompatibility at class load (25 Nov 2026: it 500'd every
    // route on this controller). The route URI stays .../validate.
    /** POST /payroll/runs/{run}/validate — run FR-22 + profile checks. */
    public function validateRun(Request $request, int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.run.validate')) {
            return $this->forbidden();
        }

        $input = $request->validate([
            'minimum_wage_overrides' => 'nullable|array',
            'minimum_wage_overrides.*' => 'nullable|string|max:500',
        ]);

        $run = $this->runs->validateRun($run, $this->user(), $input['minimum_wage_overrides'] ?? []);
        $this->logAudit(PayrollRunService::AUDIT_VALIDATED, 'payroll_run', $run->id, "Run {$run->period_year}-" . str_pad((string) $run->period_month, 2, '0', STR_PAD_LEFT) . ' validated (FR-22 + profile checks passed).');

        return response()->json(['data' => $this->runPayload($run, true)]);
    }

    /** POST /payroll/runs/{run}/approve — D-01 enforced in the service. */
    public function approve(int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.run.approve')) {
            return $this->forbidden();
        }

        $run = $this->runs->approveRun($run, $this->user());
        $this->logAudit(PayrollRunService::AUDIT_APPROVED, 'payroll_run', $run->id, "Run {$run->period_year}-" . str_pad((string) $run->period_month, 2, '0', STR_PAD_LEFT) . ' approved.');

        return response()->json(['data' => $this->runPayload($run, true)]);
    }

    /** POST /payroll/runs/{run}/close — close-block (§12.3 step 3b) enforced in the service. */
    public function close(int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.run.close')) {
            return $this->forbidden();
        }

        $run = $this->runs->closeRun($run, $this->user());
        $this->logAudit(PayrollRunService::AUDIT_CLOSED, 'payroll_run', $run->id, "Run {$run->period_year}-" . str_pad((string) $run->period_month, 2, '0', STR_PAD_LEFT) . ' closed. Payslips are now visible to employees.');

        return response()->json(['data' => $this->runPayload($run, true)]);
    }

    /** POST /payroll/runs/{run}/send-back — any non-closed state → draft, with reason. */
    public function sendBack(Request $request, int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.run.send_back')) {
            return $this->forbidden();
        }

        $input = $request->validate(['reason' => 'required|string|max:1000']);
        $run = $this->runs->sendBackRun($run, $this->user(), $input['reason']);
        $this->logAudit(PayrollRunService::AUDIT_SENT_BACK, 'payroll_run', $run->id, "Run {$run->period_year}-" . str_pad((string) $run->period_month, 2, '0', STR_PAD_LEFT) . " sent back to draft: {$input['reason']}");

        return response()->json(['data' => $this->runPayload($run, true)]);
    }

    /** GET /payroll/runs/{run}/payslips — paged payslips of a run (envelope B). */
    public function payslips(Request $request, int $run)
    {
        $run = $this->findRun($run);

        if (! $this->can('payroll.payslip.view.all')) {
            return $this->forbidden();
        }

        $page = max(1, (int) $request->input('page', 1));
        $pageSize = min(100, max(1, (int) $request->input('pageSize', 20)));
        $query = $run->payslips()->with('employee')->orderBy('employee_id');
        $total = $query->count();
        $payslips = $query->forPage($page, $pageSize)->get();

        return response()->json([
            'data' => $payslips->map(fn (PayrollPayslip $payslip) => $this->payslipPayload($payslip))->all(),
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $total,
        ]);
    }

    /** GET /payroll/payslips/{payslip} — one payslip with its calculation snapshot. */
    public function showPayslip(int $payslip)
    {
        $payslip = $this->findPayslip($payslip);

        if (! $this->can('payroll.payslip.view.all')) {
            return $this->forbidden();
        }

        return response()->json(['data' => $this->payslipPayload($payslip)]);
    }

    /**
     * GET /payroll/my-payslips — the authenticated employee's own
     * payslips, from CLOSED runs only (§9.3 rule 4: draft payslips
     * are never visible to employees). Users without a linked
     * employee record get an empty list.
     */
    public function myPayslips(Request $request)
    {
        if (! $this->can('payroll.payslip.view.self') && ! $this->can('payroll.payslip.view.all')) {
            return $this->forbidden();
        }

        $page = max(1, (int) $request->input('page', 1));
        $pageSize = min(100, max(1, (int) $request->input('pageSize', 20)));
        $employee = $this->myEmployee();

        if ($employee === null) {
            return response()->json(['data' => [], 'page' => $page, 'pageSize' => $pageSize, 'total' => 0]);
        }

        $query = PayrollPayslip::query()
            ->where('tenant_id', $this->tenantId() ?? $employee->tenant_id)
            ->where('employee_id', $employee->id)
            ->whereHas('run', fn ($q) => $q->where('status', PayrollRunService::STATUS_CLOSED))
            ->orderBy('period_year', 'desc')
            ->orderBy('period_month', 'desc');
        $total = $query->count();
        $payslips = $query->forPage($page, $pageSize)->get();

        return response()->json([
            'data' => $payslips->map(fn (PayrollPayslip $payslip) => $this->payslipPayload($payslip))->all(),
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $total,
        ]);
    }

    private function runPayload(PayrollRun $run, bool $includePayData): array
    {
        return [
            'id' => $run->id,
            'period_year' => $run->period_year,
            'period_month' => $run->period_month,
            'period_start' => $run->period_start?->format('Y-m-d'),
            'period_end' => $run->period_end?->format('Y-m-d'),
            'scope_type' => $run->scope_type,
            'scope_id' => $run->scope_id,
            'status' => $run->status,
            'type' => $run->type,
            'jurisdiction_code' => $run->jurisdiction_code,
            'jurisdiction_profile_version' => $run->jurisdiction_profile_version,
            'client_config_version' => $run->client_config_version,
            'component_catalog_version' => $run->component_catalog_version,
            // §9.3 rule 3: totals are pay data — withheld from viewers
            // without payroll.payslip.view.all.
            'totals' => $includePayData ? ($run->totals ?? null) : null,
            'payslip_count' => $run->payslips_count ?? $run->payslips()->count(),
            'created_by' => $run->created_by,
            'created_by_name' => $run->created_by ? (User::find($run->created_by)?->name) : null,
            'updated_by' => $run->updated_by,
            'created_at' => $run->created_at?->toIso8601String(),
            'updated_at' => $run->updated_at?->toIso8601String(),
        ];
    }

    private function payslipPayload(PayrollPayslip $payslip): array
    {
        $calculation = $payslip->calculation_json ?? [];
        $computation = $calculation['computation'] ?? [];

        return [
            'id' => $payslip->id,
            'payroll_run_id' => $payslip->payroll_run_id,
            'employee_id' => $payslip->employee_id,
            'employee_name' => $payslip->employee?->fullName(),
            'period_year' => $payslip->period_year,
            'period_month' => $payslip->period_month,
            'gross' => $computation['gross'] ?? null,
            'net' => $computation['net'] ?? null,
            'employer_cost' => $computation['employer_cost'] ?? null,
            'calculation' => $calculation,
            'pdf_path' => $payslip->pdf_path,
            'created_at' => $payslip->created_at?->toIso8601String(),
        ];
    }
}
