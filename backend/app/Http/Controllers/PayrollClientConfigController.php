<?php

namespace App\Http\Controllers;

use App\Models\PayrollClientConfig;
use App\Services\Payroll\PayrollRunService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Client configuration API (BRD §4, §7.7, §8.1). Configurations are
 * versioned and effective-dated: PATCH creates a new version and
 * closes the current one — history is never rewritten. Workflow
 * changes apply only to runs created after the change (§4.4).
 *
 * settings_json shape (v1):
 * {
 *   "company": {"legal_name", "trade_name", "address", "currency",
 *     "languages": ["fr","ar"],
 *     "statutory_ids": {"cnss_affiliation_number", "ice", "if"},
 *     "payroll_contact": {"name", "email"}},
 *   "payroll": {"frequency": "monthly", "pay_day", "cut_off_day",
 *     "amo_partial_exemption": false,
 *     "seniority_bands": [{"min_years": 5, "rate": 0.05}]},
 *   "approval": {"steps": 1, "separation_of_duties": true},
 *   "branding": {"languages": ["fr","ar"]}
 * }
 * Seniority bands (D-09) live here: a configurable rate table by
 * seniority band, read by the run service at calculation time.
 */
final class PayrollClientConfigController extends Controller
{
    public function __construct(
        private readonly PayrollRunService $runs,
    ) {}

    /** GET /payroll/client-config — the current configuration (envelope E). */
    public function show()
    {
        if (! $this->can('payroll.client_config.manage')) {
            return $this->forbidden();
        }

        $config = $this->runs->currentClientConfig($this->tenantId() ?? 0);

        return response()->json(['data' => $config ? $this->payload($config) : null]);
    }

    /**
     * PATCH /payroll/client-config — create a new version. The body
     * is a partial settings patch: top-level keys are replaced, and
     * the 'company' / 'payroll' / 'approval' / 'branding' objects are
     * merged key by key (seniority_bands are replaced wholesale when
     * given). A new version may also be given an effective_from.
     */
    public function update(Request $request)
    {
        if (! $this->can('payroll.client_config.manage')) {
            return $this->forbidden();
        }

        $input = $request->validate([
            'settings' => 'required|array',
            'settings.company' => 'sometimes|array',
            'settings.company.legal_name' => 'nullable|string|max:255',
            'settings.company.trade_name' => 'nullable|string|max:255',
            'settings.company.address' => 'nullable|string|max:1000',
            'settings.company.currency' => 'nullable|string|max:10',
            'settings.company.languages' => 'nullable|array',
            'settings.company.languages.*' => 'string|max:10',
            'settings.company.statutory_ids' => 'nullable|array',
            'settings.company.statutory_ids.cnss_affiliation_number' => 'nullable|string|max:100',
            'settings.company.statutory_ids.ice' => 'nullable|string|max:100',
            'settings.company.statutory_ids.if' => 'nullable|string|max:100',
            'settings.company.payroll_contact' => 'nullable|array',
            'settings.company.payroll_contact.name' => 'nullable|string|max:255',
            'settings.company.payroll_contact.email' => 'nullable|email|max:255',
            'settings.payroll' => 'sometimes|array',
            'settings.payroll.frequency' => 'nullable|string|in:monthly',
            'settings.payroll.pay_day' => 'nullable|integer|min:1|max:31',
            'settings.payroll.cut_off_day' => 'nullable|integer|min:1|max:31',
            'settings.payroll.amo_partial_exemption' => 'nullable|boolean',
            'settings.payroll.seniority_bands' => 'nullable|array',
            'settings.payroll.seniority_bands.*.min_years' => 'required|integer|min:0|max:60',
            'settings.payroll.seniority_bands.*.rate' => 'required|numeric|min:0|max:1',
            'settings.approval' => 'sometimes|array',
            'settings.approval.steps' => 'nullable|integer|min:1|max:1',
            'settings.approval.separation_of_duties' => 'nullable|boolean',
            'settings.branding' => 'sometimes|array',
            'settings.branding.languages' => 'nullable|array',
            'settings.branding.languages.*' => 'string|max:10',
            'effective_from' => 'nullable|date',
        ]);

        $tenantId = $this->tenantId();
        $current = $this->runs->currentClientConfig($tenantId ?? 0);
        $effectiveFrom = $input['effective_from'] ?? now()->toDateString();

        if ($current !== null && $effectiveFrom <= $current->effective_from->format('Y-m-d')) {
            throw ValidationException::withMessages([
                'effective_from' => 'The new version must start after the current version\'s effective_from (' . $current->effective_from->format('Y-m-d') . ').',
            ]);
        }

        $settings = $this->mergeSettings($current?->settings_json ?? [], $input['settings']);

        $config = DB::transaction(function () use ($tenantId, $current, $effectiveFrom, $settings) {
            if ($current !== null) {
                $current->update([
                    'effective_to' => date('Y-m-d', strtotime($effectiveFrom . ' -1 day')),
                ]);
            }

            return PayrollClientConfig::create([
                'tenant_id' => $tenantId,
                'version' => ($current?->version ?? 0) + 1,
                'settings_json' => $settings,
                'effective_from' => $effectiveFrom,
                'effective_to' => null,
                'created_by' => $this->user()->id,
            ]);
        });
        $this->logAudit('payroll.client_config.updated', 'payroll_client_config', $config->id, "Client configuration version {$config->version} created (effective from {$effectiveFrom}).");

        return response()->json(['data' => $this->payload($config)]);
    }

    /**
     * Merge a settings patch into the current settings. Top-level
     * keys are replaced; the four section objects are merged key by
     * key so a patch that only touches seniority bands does not wipe
     * the company block.
     */
    private function mergeSettings(array $current, array $patch): array
    {
        $merged = $current;
        foreach ($patch as $key => $value) {
            if (in_array($key, ['company', 'payroll', 'approval', 'branding'], true)
                && is_array($value)
                && isset($merged[$key]) && is_array($merged[$key])) {
                $merged[$key] = array_merge($merged[$key], $value);
            } else {
                $merged[$key] = $value;
            }
        }

        return $merged;
    }

    private function payload(PayrollClientConfig $config): array
    {
        return [
            'id' => $config->id,
            'version' => $config->version,
            'settings' => $config->settings_json ?? [],
            'effective_from' => $config->effective_from?->format('Y-m-d'),
            'effective_to' => $config->effective_to?->format('Y-m-d'),
            'created_at' => $config->created_at?->toIso8601String(),
        ];
    }
}
