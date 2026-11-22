<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\OffboardingCase;
use App\Services\AuditLogger;
use App\Services\EmployeeVisibility;
use App\Services\WorkflowEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OffboardingController extends Controller
{
    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'employeeId' => ['nullable', 'integer', 'exists:employees,id'],
        ]);
        $query = OffboardingCase::query()
            ->whereIn('employee_id', $visibility->query($request->user())->select('id'))
            ->when($filters['employeeId'] ?? null, fn ($builder, $id) => $builder->where('employee_id', $id))
            ->orderByDesc('created_at');

        return response()->json(['data' => $query->get()]);
    }

    public function show(Request $request, string $id, EmployeeVisibility $visibility): JsonResponse
    {
        $case = OffboardingCase::findOrFail($id);
        abort_unless($case->employee_id && $visibility->canSee($request->user(), $case->employee), 404);

        return response()->json(['data' => $case]);
    }

    public function store(
        Request $request,
        AuditLogger $audit,
        WorkflowEngine $workflow,
        EmployeeVisibility $visibility,
    ): JsonResponse {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'employee_name' => ['required', 'string', 'max:255'],
            'exit_date' => ['required', 'date'],
            'reason' => ['required', 'string', 'max:255'],
            'replacement' => ['nullable', 'string', 'max:255'],
        ]);
        abort_unless($visibility->canSee($request->user(), Employee::findOrFail($data['employee_id'])), 404);

        $case = DB::transaction(function () use ($data, $audit, $request, $workflow) {
            $case = OffboardingCase::create([
                ...$data,
                'stage' => 'Pending',
                'progress' => 0,
                'status' => 'On track',
            ]);
            $audit->record($request->user(), 'offboarding.created', $case);
            $workflow->startForResource($request->user(), 'offboarding', 'offboarding_case', (string) $case->id, $audit);

            return $case;
        });

        return response()->json(['data' => $case->refresh()], 201);
    }

    public function update(Request $request, string $id, AuditLogger $audit, EmployeeVisibility $visibility): JsonResponse
    {
        $case = OffboardingCase::findOrFail($id);
        abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        if ($case->employee_id) {
            abort_unless($visibility->canSee($request->user(), $case->employee), 404);
        }

        $data = $request->validate([
            'employee_name' => ['sometimes', 'string', 'max:255'],
            'exit_date' => ['sometimes', 'date'],
            'reason' => ['sometimes', 'string', 'max:255'],
            'replacement' => ['nullable', 'string', 'max:255'],
            'stage' => ['sometimes', 'string', 'max:50'],
            'progress' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'status' => ['sometimes', Rule::in(['On track', 'At risk', 'Overdue', 'Completed'])],
        ]);
        if (($data['status'] ?? null) === 'Completed' || ($data['progress'] ?? null) === 100) {
            $data['status'] = 'Completed';
            $data['progress'] = 100;
        }

        $case->update($data);
        $audit->record($request->user(), 'offboarding.updated', $case);

        return response()->json(['data' => $case]);
    }

    public function destroy(string $id, Request $request, AuditLogger $audit, EmployeeVisibility $visibility): JsonResponse
    {
        $case = OffboardingCase::findOrFail($id);
        abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        if ($case->employee_id) {
            abort_unless($visibility->canSee($request->user(), $case->employee), 404);
        }
        $audit->record($request->user(), 'offboarding.deleted', $case);
        $case->delete();

        return response()->json(['message' => 'Offboarding case deleted successfully']);
    }
}
