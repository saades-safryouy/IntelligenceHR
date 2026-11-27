<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{

    /**
     * Resolve a department id to the model AFTER the tenant middleware has run.
     *
     * NOTE — do NOT use implicit route-model binding in this controller.
     * SubstituteBindings (in the api group) runs BEFORE auth:sanctum +
     * the tenant middleware, so at binding time the tenant is not bound
     * yet, TenantContext::mode() is 'none', and the tenant scope fails
     * closed (whereRaw '1 = 0') — every bound department 404s with
     * "No query results for model" even though the row exists and the
     * list returns it (26 Nov 2026). Resolving here, inside the method,
     * runs after the tenant is bound, so the scope matches the current
     * tenant; a foreign tenant's department still 404s (BRD §2.4: 404, never 403).
     */
    private function findDepartment(string $departmentId): Department
    {
        return Department::findOrFail($departmentId);
    }

    public function index()
    {
        $departments = Department::with(['manager', 'employees'])->orderBy('name')->get();

        return response()->json(['data' => $departments
            ->map(fn ($d) => ApiPresenter::department($d))->values()->all()]);
    }

    public function store(Request $request)
    {
        if (! $this->can('people.employee.create')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'id' => ['nullable', 'string', 'max:50', 'unique:departments,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            'employee_count' => ['nullable', 'integer', 'min:0'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'parent_id' => ['nullable', 'string', 'exists:departments,id'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $department = Department::create($data);
        $this->logAudit('department.created', 'department', $department->id, $department->name);
        $department->load('manager');

        return response()->json(['data' => ApiPresenter::department($department)], 201);
    }

    public function update(Request $request, string $department)
    {
        $department = $this->findDepartment($department);

        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            'employee_count' => ['nullable', 'integer', 'min:0'],
            'budget' => ['nullable', 'numeric', 'min:0'],
            'parent_id' => ['nullable', 'string', 'exists:departments,id'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $department->update($data);
        $this->logAudit('department.updated', 'department', $department->id, $department->name);
        $department->load('manager');

        return response()->json(['data' => ApiPresenter::department($department)]);
    }

    public function destroy(string $department)
    {
        $department = $this->findDepartment($department);

        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $department->delete();
        $this->logAudit('department.deleted', 'department', $department->id, $department->name);

        return response()->noContent();
    }
}
