<?php

namespace Database\Seeders;

use App\Models\PayrollLegalParameter;
use App\Models\Tenant;
use App\Models\TenantJurisdiction;
use Illuminate\Database\Seeder;

/**
 * Morocco jurisdiction profile (MA), version 2026.1 — parameter seed
 * (BRD §6, §7.4, §11.2; research report 24 Nov 2026,
 * ~/workspace/research_notes/moroccan-payroll-regulations-20261124-2123/report.md).
 *
 * EVERY row is seeded with confidence = 'secondary': none of V-01…V-15
 * has been validated by Saad's accountant yet (gate override 24 Nov
 * 2026). Runs are blocked from closing on unvalidated parameters
 * (BRD §12.3 step 3b; the hook is ParameterSet::unvalidatedKeys()).
 * Do NOT change any row to 'confirmed'/'official' without the
 * accountant's sign-off on the matching V-item.
 *
 * Effective dating (§11.1 rule 2): a row is valid from its valid_from
 * until valid_to (null = open-ended). Values that did not change in
 * 2026 have a single row valid from 2025-01-01; values that changed
 * have a 2025 row (closed 2025-12-31) and a 2026 row.
 *
 * Idempotent: firstOrCreate on the unique
 * (jurisdiction_code, profile_version, key, valid_from). Re-running
 * the seeder never duplicates or overwrites a row — a correction is a
 * new version (§11.1 rule 3), never an edit.
 *
 * Also seeds the tenant_jurisdictions row for the Demo Company tenant
 * with status 'disabled' (D-16: profiles are enabled by a platform
 * admin only — P2 does NOT enable MA for real use).
 */
class MoroccoPayrollParametersSeeder extends Seeder
{
    public const JURISDICTION_CODE = 'MA';
    public const PROFILE_VERSION = '2026.1';

    public function run(): void
    {
        foreach ($this->parameters() as $row) {
            PayrollLegalParameter::firstOrCreate(
                [
                    'jurisdiction_code' => self::JURISDICTION_CODE,
                    'profile_version' => self::PROFILE_VERSION,
                    'key' => $row['key'],
                    'valid_from' => $row['valid_from'],
                ],
                [
                    'value' => $row['value'],
                    'value_type' => $row['type'],
                    'valid_to' => $row['valid_to'] ?? null,
                    'source' => $row['source'],
                    'confidence' => 'secondary',
                    'source_url' => $row['source_url'] ?? null,
                    'notes' => $row['notes'] ?? null,
                ]
            );
        }

        // Enablement row (D-16): MA exists for the Demo Company tenant
        // but stays DISABLED. Only a platform admin enables a profile.
        $tenant = Tenant::where('slug', 'demo-company')->first();
        if ($tenant !== null) {
            TenantJurisdiction::firstOrCreate(
                ['tenant_id' => $tenant->id, 'jurisdiction_code' => self::JURISDICTION_CODE],
                ['profile_version' => self::PROFILE_VERSION, 'status' => 'disabled']
            );
        }
    }

    /**
     * @return array<int, array{key: string, value: float|int, type: string, valid_from: string, valid_to?: string|null, source: string, source_url?: string|null, notes?: string|null}>
     */
    private function parameters(): array
    {
        $cnss = 'CNSS — espace-paie.ma, "Paiement des cotisations sociales" (read 24 Nov 2026); corroborated by CLEISS (rates at 1 Jan 2024, identical table). cnss.ma itself timed out during research — re-verify (V-01).';
        $cnssUrl = 'https://espace-paie.ma/412/fr/23/publications/paiement-des-cotisations-sociales';
        $nc736 = 'DGI Note circulaire n°736 (LF 2025, loi n°60-24), read in full; LF 2026 (loi n°50-25) did not change the scale (NC n°737, 27 Feb 2026, secondary summaries).';
        $nc736Url = 'https://ahmedazirar.com/wp-content/uploads/2025/03/NC_736_LF_2025_1741382391.pdf';
        $arrete = 'Arrêté n°1314-25 of 19 May 2025 (BO n°7443, 29 Sep 2025; application from 1 Oct 2025) — read via secondary summaries; BO text not read directly (V-07).';
        $cgi57 = 'CGI art. 57 (+ DGI service note, Mar 2017).';

        return [
            // --- CNSS / AMO / TFP (§6.1). No rate change in 2025 or 2026
            // found: one open-ended row valid from 2025-01-01 each.
            ['key' => 'cnss.ceiling', 'value' => 6000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Ceiling for the short-term + long-term branches only; family allowances, AMO and TFP have no ceiling.'],
            ['key' => 'cnss.family.employer', 'value' => 0.0640, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Prestations familiales, employer only, no ceiling.'],
            ['key' => 'cnss.short_term.employer', 'value' => 0.0105, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Includes the IPE (0.38% employer) — do NOT add IPE separately. Capped at cnss.ceiling.'],
            ['key' => 'cnss.short_term.employee', 'value' => 0.0052, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Includes the IPE (0.19% employee) — do NOT add IPE separately. Capped at cnss.ceiling.'],
            ['key' => 'cnss.long_term.employer', 'value' => 0.0793, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Pension / long-term, capped at cnss.ceiling.'],
            ['key' => 'cnss.long_term.employee', 'value' => 0.0396, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Pension / long-term, capped at cnss.ceiling.'],
            ['key' => 'amo.employer', 'value' => 0.0411, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'AMO employer = 2.26% base + 1.85% solidarity — the 1.85% is a component, not an addition. No ceiling. (V-02)'],
            ['key' => 'amo.employee', 'value' => 0.0226, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'AMO employee, no ceiling.'],
            ['key' => 'amo.employer.solidarity_only', 'value' => 0.0185, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Art. 114 loi 65-00: employers who already had group medical cover before AMO pay only the 1.85% solidarity rate. Client flag amo_partial_exemption (P3). (V-02)'],
            ['key' => 'tfp.employer', 'value' => 0.0160, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cnss, 'source_url' => $cnssUrl, 'notes' => 'Taxe de formation professionnelle, employer only, no ceiling.'],

            // --- IR brackets (§6.2). 2025 and 2026 scale identical.
            // min is the inclusive lower bound of the continuous scale
            // (the table's "40,001" is the first whole-dirham value
            // above 40,000). Formula: IR = income × rate − deduction.
            ['key' => 'ir.bracket.1.min', 'value' => 0, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.1.rate', 'value' => 0.00, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.1.deduction', 'value' => 0, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.2.min', 'value' => 40000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.2.rate', 'value' => 0.10, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.2.deduction', 'value' => 4000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.3.min', 'value' => 60000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.3.rate', 'value' => 0.20, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.3.deduction', 'value' => 10000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.4.min', 'value' => 80000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.4.rate', 'value' => 0.30, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.4.deduction', 'value' => 18000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.5.min', 'value' => 100000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.5.rate', 'value' => 0.34, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.5.deduction', 'value' => 22000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.6.min', 'value' => 180000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.6.rate', 'value' => 0.37, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.bracket.6.deduction', 'value' => 27400, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],

            // --- Professional-expenses abatement, CGI art. 59 (§6.2).
            ['key' => 'ir.frais_pro.rate_low', 'value' => 0.35, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url, 'notes' => '35% when the annual taxable gross does not exceed ir.frais_pro.threshold. Introduction date not verified in an official text (V-04).'],
            ['key' => 'ir.frais_pro.rate_high', 'value' => 0.25, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url, 'notes' => '25% above the threshold. (V-04)'],
            ['key' => 'ir.frais_pro.threshold', 'value' => 78000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url],
            ['key' => 'ir.frais_pro.cap', 'value' => 35000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url, 'notes' => 'Annual cap (≈2,916.67 DH/month).'],

            // --- Family-charge reduction, CGI art. 74 (§6.2). Changed
            // in 2026: two effective-dated rows.
            ['key' => 'ir.family_per_person', 'value' => 500, 'type' => 'amount', 'valid_from' => '2025-01-01', 'valid_to' => '2025-12-31', 'source' => 'CGI art. 74 — LF 2025 (loi n°60-24).', 'source_url' => $nc736Url, 'notes' => '2025 rate. Deducted from the tax computed, not from taxable income; floor zero. (V-05)'],
            ['key' => 'ir.family_per_person', 'value' => 600, 'type' => 'amount', 'valid_from' => '2026-01-01', 'source' => 'CGI art. 74-I — LF 2026 (loi n°50-25, income from 1 Jan 2026; NC n°737 summaries).', 'notes' => '2026 rate. (V-05)'],
            ['key' => 'ir.family_cap_persons', 'value' => 6, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => 'CGI art. 74.', 'notes' => 'Maximum 6 dependants.'],

            // --- SMIG / SMAG (§6.2). Secondary only — BO text not read.
            ['key' => 'smig.hourly', 'value' => 17.10, 'type' => 'amount', 'valid_from' => '2025-01-01', 'valid_to' => '2025-12-31', 'source' => 'Decree n°2.24.1122 (2025) — secondary only, BO text not read directly.', 'notes' => '2025 SMIG. ≈3,266.10 DH/month at 191 h. (V-06)'],
            ['key' => 'smig.hourly', 'value' => 17.92, 'type' => 'amount', 'valid_from' => '2026-01-01', 'source' => 'Decree n°2.25.983 (2026, BO n°7469) — secondary only, BO text not read directly.', 'notes' => '2026 SMIG. ≈3,422.72 DH/month at 191 h. (V-06)'],
            ['key' => 'smag.daily', 'value' => 93.00, 'type' => 'amount', 'valid_from' => '2025-04-01', 'valid_to' => '2026-03-31', 'source' => 'SMAG — secondary only.', 'notes' => 'From Apr 2025. (V-06)'],
            ['key' => 'smag.daily', 'value' => 97.44, 'type' => 'amount', 'valid_from' => '2026-04-01', 'source' => 'SMAG — secondary only.', 'notes' => 'From 1 Apr 2026. (V-06)'],

            // --- Exemptions, IR table — CGI art. 57 (§6.3).
            ['key' => 'ir.exempt.transport.urban', 'value' => 500, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Transport home→work, urban, ≥2 km, no employer transport/service car.'],
            ['key' => 'ir.exempt.transport.non_urban', 'value' => 750, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Transport home→work, outside urban areas.'],
            ['key' => 'ir.exempt.travel_flat_rate.pct', 'value' => 1.00, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Travel flat-rate for regular travellers: 100% of basic salary, capped (see ir.exempt.travel_flat_rate.cap).'],
            ['key' => 'ir.exempt.travel_flat_rate.cap', 'value' => 5000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Travel flat-rate cap, per month.'],
            ['key' => 'ir.exempt.km_rate', 'value' => 3, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Kilometric allowance, DH per km, any engine size.'],
            ['key' => 'ir.exempt.representation.pct', 'value' => 0.10, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Representation allowance: 10% of basic salary (senior managers only).'],
            ['key' => 'ir.exempt.meal_voucher.day', 'value' => 40, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url, 'notes' => 'Meal vouchers: 40 DH/employee/working day, from 1 Jan 2025 (art. 57-13°). Also capped at 20% of taxable gross (ir.exempt.meal_voucher.pct_gross).'],
            ['key' => 'ir.exempt.meal_voucher.pct_gross', 'value' => 0.20, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url, 'notes' => 'Meal vouchers: ≤20% of taxable gross.'],
            ['key' => 'ir.exempt.dismissal_cap', 'value' => 1000000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Dismissal indemnity, voluntary departure and court damages: exempt up to 1,000,000 DH combined total (art. 57-7°).'],
            ['key' => 'ir.exempt.social_event_bonus.year', 'value' => 2500, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'DGI note 2017 figure (2,500 DH/year, all events). Whether the IR cap was also raised to 5,000 DH (arrêté 1314-25 CNSS figure) was NOT verified — resolve with DGI (V-08). Seeded at the last verified IR figure.'],
            ['key' => 'ir.exempt.internship_cap', 'value' => 6000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $nc736, 'source_url' => $nc736Url, 'notes' => 'Internship allowance exempt up to 6,000 DH/month gross (art. 57-16°; LF 2025 revised conditions).'],
            ['key' => 'ir.exempt.tournee_bonus.month', 'value' => 1500, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $cgi57, 'notes' => 'Tournée bonus (sales/itinerant staff), per month. Secondary (DGI note 2017).'],

            // --- Exemptions, CNSS table — arrêté 1314-25 (§6.3).
            // Caps expressed as SMIG multiples are stored as multiples,
            // not DH amounts (§11.1 rule 5).
            ['key' => 'cnss.exempt.transport.urban', 'value' => 500, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Transport home→work, urban.'],
            ['key' => 'cnss.exempt.transport.non_urban', 'value' => 750, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Transport home→work, outside urban areas.'],
            ['key' => 'cnss.exempt.travel_flat_rate.pct', 'value' => 1.00, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Travel flat-rate: 100% of basic salary, capped (see cnss.exempt.travel_flat_rate.cap).'],
            ['key' => 'cnss.exempt.travel_flat_rate.cap', 'value' => 5000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Travel flat-rate cap, per month.'],
            ['key' => 'cnss.exempt.km_rate', 'value' => 3, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Kilometric allowance, DH per km (≥50 km).'],
            ['key' => 'cnss.exempt.representation.pct', 'value' => 0.10, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Representation allowance: 10% of basic salary.'],
            ['key' => 'cnss.exempt.meal_voucher.smig_multiple', 'value' => 2, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Tickets restaurant: 2×SMIG hourly per day (= 35.84 DH in 2026). Non-cumulative with prime de panier.'],
            ['key' => 'cnss.exempt.dismissal_cap', 'value' => 1000000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Dismissal + damages (labour-inspector agreement / judgment / arbitration): up to 1,000,000 DH.'],
            ['key' => 'cnss.exempt.voluntary_departure.smig_multiple', 'value' => 2080, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Voluntary / retirement departure: 2,080×SMIG hourly (= 37,273.60 DH in 2026) or 260×SMAG daily.'],
            ['key' => 'cnss.exempt.social_event_bonus.year', 'value' => 5000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Family-event bonuses: 5,000 DH/year/employee, all events combined, exceptional and non-flat-rate.'],
            ['key' => 'cnss.exempt.internship_cap', 'value' => 6000, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Insertion internship 1,600–6,000 DH/month; above 6,000 DH the WHOLE amount becomes contributory (cliff, not a cap).'],
            ['key' => 'cnss.exempt.tournee_bonus.month', 'value' => 1500, 'type' => 'amount', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Tournée bonus, per month. Secondary.'],
            ['key' => 'cnss.exempt.allowance_caisse.smig_multiple', 'value' => 14, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Cash-handling allowance: 14×SMIG/h per 26 days (= 250.88 DH in 2026).'],
            ['key' => 'cnss.exempt.allowance_lait.smig_multiple', 'value' => 11, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Milk allowance: 11×SMIG/h per 26 days (= 197.12 DH in 2026).'],
            ['key' => 'cnss.exempt.allowance_outillage.smig_multiple', 'value' => 7, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Tool allowance: 7×SMIG/h per 26 days (= 125.44 DH in 2026).'],
            ['key' => 'cnss.exempt.allowance_salissure.smig_multiple', 'value' => 14, 'type' => 'integer', 'valid_from' => '2025-01-01', 'source' => $arrete, 'notes' => 'Dirt/clothing allowance: 14×SMIG/h per 26 days (= 250.88 DH in 2026).'],

            // --- Overtime uplifts (Labour Code art. 201). Unverified —
            // confirm against the Labour Code text (V-10). Seeded as
            // multipliers (1.25 = +25%).
            ['key' => 'overtime.uplift.normal', 'value' => 1.25, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => 'Labour Code art. 201 — TO CONFIRM (V-10).', 'notes' => 'Day overtime: +25%.'],
            ['key' => 'overtime.uplift.night', 'value' => 1.50, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => 'Labour Code art. 201 — TO CONFIRM (V-10).', 'notes' => 'Night overtime: +50%.'],
            ['key' => 'overtime.uplift.holiday', 'value' => 2.00, 'type' => 'rate', 'valid_from' => '2025-01-01', 'source' => 'Labour Code art. 201 — TO CONFIRM (V-10).', 'notes' => 'Holiday overtime: +100%.'],
        ];
    }
}
