<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use App\Services\AuditLogger;
use App\Services\EmployeeVisibility;
use App\Services\WorkflowEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OnboardingController extends Controller
{
    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'employeeId' => ['nullable', 'integer', 'exists:employees,id'],
        ]);
        $showAllTasks = $request->user()->hasPermission('people.employee.update');
        $query = OnboardingCase::with(['tasks' => fn ($tasks) => $tasks
            ->when(! $showAllTasks, fn ($builder) => $builder->where('employee_visible', true))])
            ->whereIn('employee_id', $visibility->query($request->user())->select('id'))
            ->when($filters['employeeId'] ?? null, fn ($builder, $id) => $builder->where('employee_id', $id))
            ->orderByDesc('created_at');

        return response()->json(['data' => $query->get()]);
    }

    public function show(Request $request, OnboardingCase $onboardingCase, EmployeeVisibility $visibility): JsonResponse
    {
        abort_unless($onboardingCase->employee_id && $visibility->canSee($request->user(), $onboardingCase->employee), 404);
        $tasks = $onboardingCase->tasks();
        if (! $request->user()->hasPermission('people.employee.update')) {
            $tasks->where('employee_visible', true);
        }

        return response()->json(['data' => $onboardingCase->setRelation('tasks', $tasks->get())]);
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
            'position' => ['required', 'string', 'max:255'],
            'department' => ['required', 'string', 'max:255'],
            'start_date' => ['required', 'date'],
            'assignee' => ['nullable', 'string', 'max:255'],
        ]);
        abort_unless($visibility->canSee($request->user(), Employee::findOrFail($data['employee_id'])), 404);

        $case = DB::transaction(function () use ($data, $audit, $request, $workflow) {
            $c = OnboardingCase::create([
                ...$data,
                'stage' => 'HR Validation',
                'progress' => 0,
                'status' => 'On track',
            ]);
            $audit->record($request->user(), 'onboarding.created', $c);
            $workflow->startForResource($request->user(), 'onboarding', 'onboarding_case', (string) $c->id, $audit);

            return $c;
        });

        return response()->json(['data' => $case->refresh()->load('tasks')], 201);
    }

    public function updateTask(Request $request, OnboardingTask $task, AuditLogger $audit): JsonResponse
    {
        $case = $task->onboardingCase;
        if (! $request->user()->hasPermission('people.employee.update')) {
            abort_unless(
                $request->user()->hasPermission('people.employee.self.update')
                    && $request->user()->employee_id
                    && (int) $case->employee_id === (int) $request->user()->employee_id
                    && $task->employee_visible,
                403,
            );
        }

        $data = $request->validate([
            'done' => ['required', 'boolean'],
        ]);

        DB::transaction(function () use ($task, $case, $data, $audit, $request) {
            $task->update(['done' => $data['done']]);
            $total = $case->tasks()->count();
            $doneCount = $case->tasks()->where('done', true)->count();
            $progress = $total > 0 ? (int) round(($doneCount / $total) * 100) : 0;
            $case->update(['progress' => $progress]);
            $audit->record($request->user(), 'onboarding_task.updated', $task);
        });

        $tasks = $case->tasks();
        if (! $request->user()->hasPermission('people.employee.update')) {
            $tasks->where('employee_visible', true);
        }
        $case->setRelation('tasks', $tasks->get());
        $task->setRelation('onboardingCase', $case);

        return response()->json(['data' => $task]);
    }

    public function update(Request $request, OnboardingCase $onboardingCase, AuditLogger $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        $data = $request->validate([
            'employee_name' => ['sometimes', 'string', 'max:255'],
            'position' => ['sometimes', 'string', 'max:255'],
            'department' => ['sometimes', 'string', 'max:255'],
            'start_date' => ['sometimes', 'date'],
            'assignee' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(['On track', 'At risk', 'Completed', 'Overdue'])],
        ]);
        $onboardingCase->update($data);
        $audit->record($request->user(), 'onboarding.updated', $onboardingCase);

        return response()->json(['data' => $onboardingCase->refresh()->load('tasks')]);
    }

    public function updateStage(Request $request, OnboardingCase $onboardingCase, AuditLogger $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        $data = $request->validate([
            'stage' => ['required', Rule::in(['HR Validation', 'Manager Approval', 'Local IT', 'ISD', 'Completed'])],
        ]);
        $onboardingCase->update($data);
        $audit->record($request->user(), 'onboarding.stage_updated', $onboardingCase);

        return response()->json(['data' => $onboardingCase->refresh()]);
    }

    public function destroy(Request $request, OnboardingCase $onboardingCase, AuditLogger $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        $audit->record($request->user(), 'onboarding.deleted', $onboardingCase);
        $onboardingCase->delete();

        return response()->json([], 204);
    }
}
