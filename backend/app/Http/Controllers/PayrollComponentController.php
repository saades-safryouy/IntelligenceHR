<?php

namespace App\Http\Controllers;

use App\Models\PayrollSalaryComponent;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Component catalog API (BRD §7.5, §8.1). The catalog is tenant-level
 * (FR-11): codes are unique per tenant. Components are never deleted
 * — they are deactivated (active = false), because structure lines
 * keep a denormalised component_code even after the row is gone.
 * System components (base_salary, overtime — seeded by the core in
 * P3) cannot be renamed or re-typed; only their names, active flag
 * and effective dates may change.
 */
final class PayrollComponentController extends Controller
{

    /**
     * Resolve a component id to the model AFTER the tenant middleware has run.
     *
     * NOTE — do NOT use implicit route-model binding in this controller.
     * SubstituteBindings (in the api group) runs BEFORE auth:sanctum +
     * the tenant middleware, so at binding time the tenant is not bound
     * yet, TenantContext::mode() is 'none', and the tenant scope fails
     * closed (whereRaw '1 = 0') — every bound component 404s with
     * "No query results for model" even though the row exists and the
     * list returns it (26 Nov 2026). Resolving here, inside the method,
     * runs after the tenant is bound, so the scope matches the current
     * tenant; a foreign tenant's component still 404s (BRD §2.4: 404, never 403).
     */
    private function findComponent(int $componentId): PayrollSalaryComponent
    {
        return PayrollSalaryComponent::findOrFail($componentId);
    }

    /** GET /payroll/components — the tenant's catalog (envelope E). */
    public function index()
    {
        if (! $this->can('payroll.salary.view')) {
            return $this->forbidden();
        }

        $components = PayrollSalaryComponent::query()
            ->orderBy('code')
            ->get()
            ->map(fn (PayrollSalaryComponent $component) => $this->payload($component))
            ->all();

        return response()->json(['data' => $components]);
    }

    /** POST /payroll/components — add a catalog entry. */
    public function store(Request $request)
    {
        if (! $this->can('payroll.component.manage')) {
            return $this->forbidden();
        }

        $input = $this->validateComponent($request, null);
        $component = PayrollSalaryComponent::create(array_merge($input, [
            'tenant_id' => $this->tenantId(),
            // HR-created components are never system components.
            'is_system' => false,
            'created_by' => $this->user()->id,
            'updated_by' => $this->user()->id,
        ]));
        $this->logAudit('payroll.component.created', 'payroll_salary_component', $component->id, "Component '{$component->code}' added to the catalog.");

        return response()->json(['data' => $this->payload($component)], 201);
    }

    /** PATCH /payroll/components/{component} — edit a catalog entry. */
    public function update(Request $request, int $component)
    {
        $component = $this->findComponent($component);

        if (! $this->can('payroll.component.manage')) {
            return $this->forbidden();
        }

        $input = $this->validateComponent($request, $component);

        if ($component->is_system) {
            // System components keep their meaning: only names, the
            // active flag and effective dates may change.
            $forbidden = array_intersect(
                ['code', 'category', 'cnss_subject', 'ir_subject', 'cap_type', 'cap_value', 'counts_toward_tax_abatement'],
                array_keys($input)
            );
            if ($forbidden !== []) {
                return response()->json([
                    'message' => 'System components (base_salary, overtime) cannot change their code, category, treatment flags or cap. Only names, the active flag and effective dates may change.',
                ], 422);
            }
        }

        $component->update(array_merge($input, ['updated_by' => $this->user()->id]));
        $this->logAudit('payroll.component.updated', 'payroll_salary_component', $component->id, "Component '{$component->code}' updated.");

        return response()->json(['data' => $this->payload($component->fresh())]);
    }

    private function validateComponent(Request $request, ?PayrollSalaryComponent $component): array
    {
        $tenantId = $this->tenantId();

        return $request->validate([
            'code' => [
                $component === null ? 'required' : 'sometimes',
                'string', 'max:50',
                Rule::unique('payroll_salary_components', 'code')
                    ->where('tenant_id', $tenantId)
                    ->ignore($component?->id),
            ],
            'name_fr' => 'nullable|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'category' => 'sometimes|string|in:earning,allowance,bonus,deduction,benefit',
            'cnss_subject' => 'sometimes|boolean',
            'ir_subject' => 'sometimes|boolean',
            'cap_type' => 'sometimes|string|in:none,fixed_period,fixed_amount,percentage,smig_multiple',
            'cap_value' => 'nullable|numeric|min:0',
            'counts_toward_tax_abatement' => 'sometimes|boolean',
            'suggested_by_profile' => 'nullable|string|max:50',
            'active' => 'sometimes|boolean',
            'effective_from' => 'nullable|date',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
        ]);
    }

    private function payload(PayrollSalaryComponent $component): array
    {
        return [
            'id' => $component->id,
            'code' => $component->code,
            'name_fr' => $component->name_fr,
            'name_ar' => $component->name_ar,
            'name_en' => $component->name_en,
            'category' => $component->category,
            'cnss_subject' => (bool) $component->cnss_subject,
            'ir_subject' => (bool) $component->ir_subject,
            'cap_type' => $component->cap_type,
            'cap_value' => $component->cap_value !== null ? (float) $component->cap_value : null,
            'counts_toward_tax_abatement' => (bool) $component->counts_toward_tax_abatement,
            'is_system' => (bool) $component->is_system,
            'suggested_by_profile' => $component->suggested_by_profile,
            'active' => (bool) $component->active,
            'effective_from' => $component->effective_from?->format('Y-m-d'),
            'effective_to' => $component->effective_to?->format('Y-m-d'),
            'created_at' => $component->created_at?->toIso8601String(),
            'updated_at' => $component->updated_at?->toIso8601String(),
        ];
    }
}
