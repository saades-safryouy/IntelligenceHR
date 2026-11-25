<?php

namespace App\Services\Payroll;

use App\Models\PayrollLegalParameter;
use App\Models\TenantJurisdiction;

/**
 * Loads a ParameterSet from the payroll_legal_parameters table (BRD
 * §7.4, §11.1). Parameters are effective-dated: for a date $at, the
 * row with the latest valid_from (not after $at, not yet expired)
 * wins per key. Rows are immutable once used by a closed run; a
 * correction creates a new version (a later valid_from), it never
 * edits the row in place.
 *
 * Parameters are profile-owned and SHARED across tenants (one
 * Moroccan rate set serves every Moroccan tenant), so this loader
 * never filters by tenant — the tenant only chooses which profile
 * version it has installed (tenant_jurisdictions).
 */
final class PayrollParameterLoader
{
    /**
     * The parameter set valid at $at (YYYY-MM-DD) for a jurisdiction
     * profile version. The set has no single row id (it is assembled
     * from rows), so ParameterSet::$id is null and $validFrom is the
     * date the set is valid for.
     */
    public function load(string $jurisdictionCode, string $profileVersion, string $at): ParameterSet
    {
        $rows = PayrollLegalParameter::query()
            ->where('jurisdiction_code', $jurisdictionCode)
            ->where('profile_version', $profileVersion)
            ->where('valid_from', '<=', $at)
            ->where(function ($query) use ($at) {
                $query->whereNull('valid_to')->orWhere('valid_to', '>=', $at);
            })
            ->orderBy('valid_from', 'desc')
            ->orderBy('id', 'desc')
            ->get();

        $values = [];
        $confidences = [];
        foreach ($rows as $row) {
            if (array_key_exists($row->key, $values)) {
                continue; // Latest valid_from wins per key.
            }
            $values[$row->key] = (float) $row->value;
            $confidences[$row->key] = $row->confidence;
        }

        return new ParameterSet($jurisdictionCode, $profileVersion, null, $at, $values, $confidences);
    }

    /**
     * The parameter rows valid at $at, one per key (latest valid_from
     * wins), with value, confidence and validity dates — for the
     * read-only parameters page. Sorted by key.
     */
    public function listAt(string $jurisdictionCode, string $profileVersion, string $at): array
    {
        $rows = PayrollLegalParameter::query()
            ->where('jurisdiction_code', $jurisdictionCode)
            ->where('profile_version', $profileVersion)
            ->where('valid_from', '<=', $at)
            ->where(function ($query) use ($at) {
                $query->whereNull('valid_to')->orWhere('valid_to', '>=', $at);
            })
            ->orderBy('valid_from', 'desc')
            ->orderBy('id', 'desc')
            ->get();

        $byKey = [];
        foreach ($rows as $row) {
            if (array_key_exists($row->key, $byKey)) {
                continue; // Latest valid_from wins per key.
            }
            $byKey[$row->key] = [
                'key' => $row->key,
                'value' => (float) $row->value,
                'confidence' => $row->confidence,
                'valid_from' => $row->valid_from?->format('Y-m-d'),
                'valid_to' => $row->valid_to?->format('Y-m-d'),
            ];
        }
        ksort($byKey);

        return array_values($byKey);
    }

    /**
     * The profile version a tenant has installed for a jurisdiction
     * (latest enablement row), or null when the tenant has no row.
     */
    public function profileVersionForTenant(int $tenantId, string $jurisdictionCode): ?string
    {
        $row = $this->tenantJurisdictionRow($tenantId, $jurisdictionCode);

        return $row?->jurisdiction_profile_version;
    }

    /**
     * The enablement status a tenant has for a jurisdiction
     * ('enabled' | 'disabled'), or null when the tenant has no row.
     */
    public function jurisdictionStatusForTenant(int $tenantId, string $jurisdictionCode): ?string
    {
        $row = $this->tenantJurisdictionRow($tenantId, $jurisdictionCode);

        return $row?->status;
    }

    private function tenantJurisdictionRow(int $tenantId, string $jurisdictionCode): ?TenantJurisdiction
    {
        return TenantJurisdiction::query()
            ->where('tenant_id', $tenantId)
            ->where('jurisdiction_code', $jurisdictionCode)
            ->orderBy('id', 'desc')
            ->first();
    }
}
