<?php

namespace App\Http\Controllers;

use App\Models\PayrollSalaryComponent;
use App\Models\PayrollSalaryStructure;
use App\Models\PayrollStructureLine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Salary structure API (BRD §7.3, §8.1). Structures are
 * effective-dated versions: creating a structure closes any
 * overlapping version for the same employee (its effective_to is set
 * to the day before the new version starts), and PATCH creates a new
 * version and closes the old one — history is never rewritten.
 * Salary data lives here, never in employees (§9.3 rule 2).
 */
final class PayrollStructureController extends Controller
{

    /**
     * Resolve a structure id to the model AFTER the tenant middleware has run.
     *
     * NOTE — do NOT use implicit route-model binding in this controller.
     * SubstituteBindings (in the api group) runs BEFORE auth:sanctum +
     * the tenant middleware, so at binding time the tenant is not bound
     * yet, TenantContext::mode() is 'none', and the tenant scope fails
     * closed (whereRaw '1 = 0') — every bound structure 404s with
     * "No query results for model" even though the row exists and the
     * list returns it (26 Nov 2026). Resolving here, inside the method,
     * runs after the tenant is bound, so the scope matches the current
     * tenant; a foreign tenant's structure still 404s (BRD §2.4: 404, never 403).
     */
    private function findStructure(int $structureId): PayrollSalaryStructure
    {
        return PayrollSalaryStructure::findOrFail($structureId);
    }

    /** GET /payroll/salary-structures?employeeId= — versions (envelope E). */
    public function index(Request $request)
    {
        if (! $this->can('payroll.salary.view')) {
            return $this->forbidden();
        }

        $query = PayrollSalaryStructure::query()->with('lines')->orderBy('employee_id')->orderBy('effective_from', 'desc');
        if ($request->filled('employeeId')) {
            $query->where('employee_id', $request->input('employeeId'));
        }

        return response()->json([
            'data' => $query->get()->map(fn (PayrollSalaryStructure $structure) => $this->payload($structure))->all(),
        ]);
    }

    /** POST /payroll/salary-structures — create a version (closes overlaps). */
    public function store(Request $request)
    {
        if (! $this->can('payroll.salary.manage')) {
            return $this->forbidden();
        }

        $input = $this->validateStructure($request);
        $tenantId = $this->tenantId();

        $structure = DB::transaction(function () use ($input, $tenantId) {
            $this->closeOverlappingVersions(
                $tenantId,
                (int) $input['employee_id'],
                $input['effective_from']
            );

            return $this->createVersion($tenantId, $input);
        });
        $this->logAudit('payroll.salary_structure.created', 'payroll_salary_structure', $structure->id, "Salary structure created for employee {$input['employee_id']} from {$input['effective_from']} (base {$input['base_salary']} DH).");

        return response()->json(['data' => $this->payload($structure->fresh('lines'))], 201);
    }

    /**
     * PATCH /payroll/salary-structures/{structure} — create a new
     * version from the given one and close the old version. The new
     * version must start after the old version's effective_from.
     */
    public function update(Request $request, int $structure)
    {
        $structure = $this->findStructure($structure);

        if (! $this->can('payroll.salary.manage')) {
            return $this->forbidden();
        }

        $input = $this->validateStructure($request, true);
        $effectiveFrom = $input['effective_from'] ?? now()->toDateString();

        if (isset($input['employee_id']) && (int) $input['employee_id'] !== (int) $structure->employee_id) {
            throw ValidationException::withMessages([
                'employee_id' => 'A structure version cannot move to another employee. Create a new structure for that employee instead.',
            ]);
        }

        if ($effectiveFrom <= $structure->effective_from->format('Y-m-d')) {
            throw ValidationException::withMessages([
                'effective_from' => 'The new version must start after the current version\'s effective_from (' . $structure->effective_from->format('Y-m-d') . ').',
            ]);
        }

        $merged = [
            'employee_id' => $structure->employee_id,
            'base_salary' => $input['base_salary'] ?? (float) $structure->base_salary,
            'contractual_hours_month' => $input['contractual_hours_month'] ?? $structure->contractual_hours_month,
            'employment_type' => $input['employment_type'] ?? $structure->employment_type,
            'effective_from' => $effectiveFrom,
            'effective_to' => $input['effective_to'] ?? null,
            'notes' => $input['notes'] ?? $structure->notes,
            'lines' => $input['lines'] ?? null, // null = copy the old version's lines
        ];

        $newVersion = DB::transaction(function () use ($structure, $merged, $effectiveFrom, $input) {
            $structure->update([
                'effective_to' => date('Y-m-d', strtotime($effectiveFrom . ' -1 day')),
                'updated_by' => $this->user()->id,
            ]);

            $created = $this->createVersion($structure->tenant_id, $merged);

            // No lines given: the new version inherits the old
            // version's lines (a version change is usually a base
            // salary change, not a line change).
            if (! array_key_exists('lines', $input)) {
                foreach ($structure->lines()->get() as $oldLine) {
                    PayrollStructureLine::create([
                        'tenant_id' => $structure->tenant_id,
                        'salary_structure_id' => $created->id,
                        'component_id' => $oldLine->component_id,
                        'component_code' => $oldLine->component_code,
                        'amount' => $oldLine->amount,
                        'notes' => $oldLine->notes,
                    ]);
                }
            }

            return $created;
        });
        $this->logAudit('payroll.salary_structure.updated', 'payroll_salary_structure', $newVersion->id, "Salary structure for employee {$structure->employee_id} versioned from {$effectiveFrom} (previous version closed).");

        return response()->json(['data' => $this->payload($newVersion->fresh('lines'))]);
    }

    private function validateStructure(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $tenantId = $this->tenantId();

        $validated = $request->validate([
            'employee_id' => [$required, 'integer'],
            'base_salary' => [$required, 'numeric', 'min:0'],
            'contractual_hours_month' => 'sometimes|numeric|min:1|max:744',
            'employment_type' => 'sometimes|string|max:100',
            'effective_from' => [$required, 'date'],
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
            'notes' => 'nullable|string|max:2000',
            'lines' => 'sometimes|array',
            'lines.*.component_code' => 'required|string|max:50',
            'lines.*.amount' => 'required|numeric|min:0',
        ]);

        // The employee must belong to this tenant.
        if (isset($validated['employee_id'])) {
            $exists = \App\Models\Employee::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $validated['employee_id'])
                ->exists();
            if (! $exists) {
                throw ValidationException::withMessages(['employee_id' => 'Unknown employee for this tenant.']);
            }
        }

        // Every line must reference a catalog component of this tenant.
        foreach ($validated['lines'] ?? [] as $line) {
            $exists = PayrollSalaryComponent::query()
                ->where('tenant_id', $tenantId)
                ->where('code', $line['component_code'])
                ->exists();
            if (! $exists) {
                throw ValidationException::withMessages([
                    'lines' => "Component '{$line['component_code']}' is not in this tenant's catalog. Add it under Components first.",
                ]);
            }
        }

        return $validated;
    }

    private function createVersion(int $tenantId, array $input): PayrollSalaryStructure
    {
        $structure = PayrollSalaryStructure::create([
            'tenant_id' => $tenantId,
            'employee_id' => $input['employee_id'],
            'base_salary' => $input['base_salary'],
            'contractual_hours_month' => $input['contractual_hours_month'] ?? 191,
            'employment_type' => $input['employment_type'] ?? 'Full-time',
            'effective_from' => $input['effective_from'],
            'effective_to' => $input['effective_to'] ?? null,
            'notes' => $input['notes'] ?? null,
            'created_by' => $this->user()->id,
            'updated_by' => $this->user()->id,
        ]);

        foreach ($input['lines'] ?? [] as $line) {
            $component = PayrollSalaryComponent::query()
                ->where('tenant_id', $tenantId)
                ->where('code', $line['component_code'])
                ->first();
            PayrollStructureLine::create([
                'tenant_id' => $tenantId,
                'salary_structure_id' => $structure->id,
                'component_id' => $component?->id,
                'component_code' => $line['component_code'],
                'amount' => $line['amount'],
                'notes' => $line['notes'] ?? null,
            ]);
        }

        return $structure;
    }

    /**
     * Close every version of the employee that overlaps the new
     * version's start date (their effective_to becomes the day
     * before). Versions starting after the new version are untouched
     * — the caller validates ordering.
     */
    private function closeOverlappingVersions(int $tenantId, int $employeeId, string $effectiveFrom): void
    {
        $dayBefore = date('Y-m-d', strtotime($effectiveFrom . ' -1 day'));
        PayrollSalaryStructure::query()
            ->where('tenant_id', $tenantId)
            ->where('employee_id', $employeeId)
            ->where('effective_from', '<=', $effectiveFrom)
            ->where(function ($query) use ($effectiveFrom) {
                $query->whereNull('effective_to')->orWhere('effective_to', '>=', $effectiveFrom);
            })
            ->update(['effective_to' => $dayBefore, 'updated_by' => $this->user()->id]);
    }

    private function payload(PayrollSalaryStructure $structure): array
    {
        return [
            'id' => $structure->id,
            'employee_id' => $structure->employee_id,
            'employee_name' => $structure->employee?->fullName(),
            'base_salary' => (float) $structure->base_salary,
            'contractual_hours_month' => $structure->contractual_hours_month,
            'employment_type' => $structure->employment_type,
            'effective_from' => $structure->effective_from?->format('Y-m-d'),
            'effective_to' => $structure->effective_to?->format('Y-m-d'),
            'notes' => $structure->notes,
            'lines' => $structure->lines->map(fn (PayrollStructureLine $line) => [
                'id' => $line->id,
                'component_id' => $line->component_id,
                'component_code' => $line->component_code,
                'amount' => (float) $line->amount,
                'notes' => $line->notes,
            ])->all(),
            'created_at' => $structure->created_at?->toIso8601String(),
            'updated_at' => $structure->updated_at?->toIso8601String(),
        ];
    }
}
