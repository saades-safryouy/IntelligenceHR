<?php

namespace App\Http\Controllers;

use App\Models\TenantJurisdiction;
use App\Services\Payroll\MoroccoPayrollAdapter;
use App\Services\Payroll\PayrollParameterLoader;
use Illuminate\Http\Request;

/**
 * Legal parameters + jurisdiction enablement, READ-ONLY in P3 (BRD
 * §8.1). Legal parameters are profile-owned and shared across
 * tenants; they are never edited through this API — a correction
 * creates a new parameter version (platform admin only, later phase).
 * The parameters page shows each key with its confidence label and
 * an "unvalidated — awaiting accountant validation" banner while any
 * key is not official/confirmed.
 */
final class PayrollParameterController extends Controller
{
    public function __construct(
        private readonly PayrollParameterLoader $loader,
    ) {}

    /**
     * GET /payroll/parameters?jurisdiction=MA&at=YYYY-MM-DD — the
     * parameter set valid at a date (envelope E).
     */
    public function index(Request $request)
    {
        if (! $this->can('payroll.run.view')) {
            return $this->forbidden();
        }

        $jurisdiction = strtoupper((string) $request->input('jurisdiction', 'MA'));
        $at = (string) $request->input('at', now()->toDateString());
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $at)) {
            return response()->json(['message' => 'Query parameter "at" must be a date (YYYY-MM-DD).'], 422);
        }

        $tenantId = $this->tenantId();
        $profileVersion = ($tenantId !== null
            ? $this->loader->profileVersionForTenant($tenantId, $jurisdiction)
            : null) ?? (new MoroccoPayrollAdapter)->profileVersion();

        $parameters = $this->loader->listAt($jurisdiction, $profileVersion, $at);
        $unvalidated = array_values(array_filter(
            $parameters,
            fn (array $row) => ! in_array($row['confidence'], ['official', 'confirmed'], true)
        ));

        return response()->json(['data' => [
            'jurisdiction' => $jurisdiction,
            'profile_version' => $profileVersion,
            'at' => $at,
            'parameters' => $parameters,
            'total_count' => count($parameters),
            'unvalidated_count' => count($unvalidated),
            'unvalidated_keys' => array_map(fn (array $row) => $row['key'], $unvalidated),
        ]]);
    }

    /** GET /payroll/jurisdictions — installed profiles + status (envelope E). */
    public function jurisdictions()
    {
        if (! $this->can('payroll.run.view')) {
            return $this->forbidden();
        }

        $rows = TenantJurisdiction::query()->orderBy('jurisdiction_code')->get();

        return response()->json(['data' => $rows->map(fn (TenantJurisdiction $row) => [
            'jurisdiction_code' => $row->jurisdiction_code,
            'jurisdiction_profile_version' => $row->jurisdiction_profile_version,
            'status' => $row->status,
            'enabled_at' => $row->enabled_at?->toIso8601String(),
            'disabled_at' => $row->disabled_at?->toIso8601String(),
        ])->all()]);
    }
}
