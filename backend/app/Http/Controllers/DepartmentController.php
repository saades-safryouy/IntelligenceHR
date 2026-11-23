<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
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
        $department->load('manager');

        return response()->json(['data' => ApiPresenter::department($department)], 201);
    }

    public function update(Request $request, Department $department)
    {
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
        $department->load('manager');

        return response()->json(['data' => ApiPresenter::department($department)]);
    }

    public function destroy(Department $department)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $department->delete();

        return response()->noContent();
    }
}
