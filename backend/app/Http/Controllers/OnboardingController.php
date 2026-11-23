<?php

namespace App\Http\Controllers;

use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use App\Support\ApiPresenter;
use App\Support\WorkflowStarter;
use Illuminate\Http\Request;

class OnboardingController extends Controller
{
    // --- Onboarding cases ---
    public function indexOnboarding()
    {
        $cases = OnboardingCase::with('tasks')->orderByDesc('created_at')->get();

        return response()->json(['data' => $cases
            ->map(fn ($c) => ApiPresenter::onboardingCase($c))->values()->all()]);
    }

    public function showOnboarding(OnboardingCase $onboardingCase)
    {
        $onboardingCase->load('tasks');

        return response()->json(['data' => ApiPresenter::onboardingCase($onboardingCase)]);
    }

    public function storeOnboarding(Request $request)
    {
        if (! $this->can('people.employee.create')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'employee_name' => ['required', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'start_date' => ['nullable', 'date'],
            'assignee' => ['nullable', 'string', 'max:255'],
        ]);
        $case = OnboardingCase::create($data + [
            'stage' => 'HR Validation', 'progress' => 0, 'status' => 'On track',
        ]);
        // Default checklist (label keys are i18n keys — see contract §3.5).
        foreach ([
            ['label_key' => 'taskWelcomePack', 'employee_visible' => true],
            ['label_key' => 'taskIdPhoto', 'employee_visible' => true],
            ['label_key' => 'taskCompleteProfile', 'employee_visible' => true],
            ['label_key' => 'taskLaptopAck', 'employee_visible' => true],
            ['label_key' => 'taskSecurityBriefing', 'employee_visible' => true],
            ['label_key' => 'taskAdProvisioning', 'employee_visible' => false],
        ] as $task) {
            $case->tasks()->create($task);
        }
        WorkflowStarter::startFor('onboarding_case', (string) $case->id, (string) $this->user()->id, $case->employee);
        $case->load('tasks');

        return response()->json(['data' => ApiPresenter::onboardingCase($case)], 201);
    }

    public function updateOnboarding(Request $request, OnboardingCase $onboardingCase)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'employee_name' => ['sometimes', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'start_date' => ['nullable', 'date'],
            'assignee' => ['nullable', 'string', 'max:255'],
            'stage' => ['nullable', 'string'],
            'progress' => ['nullable', 'integer', 'min:0', 'max:100'],
            'status' => ['nullable', 'string'],
            'approval_status' => ['nullable', 'string'],
        ]);
        $onboardingCase->update($data);
        $onboardingCase->load('tasks');

        return response()->json(['data' => ApiPresenter::onboardingCase($onboardingCase)]);
    }

    public function destroyOnboarding(OnboardingCase $onboardingCase)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $onboardingCase->delete();

        return response()->noContent();
    }

    /** PATCH /onboarding-tasks/{task} — toggle a checklist item. */
    public function toggleTask(Request $request, OnboardingTask $onboardingTask)
    {
        $data = $request->validate(['done' => ['required', 'boolean']]);
        $onboardingTask->update(['done' => $data['done']]);

        // Keep the case progress in sync with done tasks.
        $case = $onboardingTask->onboardingCase;
        $total = $case->tasks()->count();
        if ($total > 0) {
            $done = $case->tasks()->where('done', true)->count();
            $case->update(['progress' => (int) round($done / $total * 100)]);
        }

        return response()->json(['data' => ApiPresenter::onboardingTask($onboardingTask)]);
    }

    // --- Offboarding cases ---
    public function indexOffboarding()
    {
        $cases = OffboardingCase::orderByDesc('created_at')->get();

        return response()->json(['data' => $cases
            ->map(fn ($c) => ApiPresenter::offboardingCase($c))->values()->all()]);
    }

    public function showOffboarding(OffboardingCase $offboardingCase)
    {
        return response()->json(['data' => ApiPresenter::offboardingCase($offboardingCase)]);
    }

    public function storeOffboarding(Request $request)
    {
        if (! $this->can('people.employee.create')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'employee_name' => ['required', 'string', 'max:255'],
            'exit_date' => ['nullable', 'date'],
            'reason' => ['nullable', 'string'],
            'replacement' => ['nullable', 'string', 'max:255'],
        ]);
        $case = OffboardingCase::create($data + [
            'stage' => 'HR Validation', 'progress' => 0, 'status' => 'On track',
        ]);
        WorkflowStarter::startFor('offboarding_case', (string) $case->id, (string) $this->user()->id, $case->employee);

        return response()->json(['data' => ApiPresenter::offboardingCase($case)], 201);
    }

    public function updateOffboarding(Request $request, OffboardingCase $offboardingCase)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'employee_name' => ['sometimes', 'string', 'max:255'],
            'exit_date' => ['nullable', 'date'],
            'reason' => ['nullable', 'string'],
            'replacement' => ['nullable', 'string', 'max:255'],
            'stage' => ['nullable', 'string'],
            'progress' => ['nullable', 'integer', 'min:0', 'max:100'],
            'status' => ['nullable', 'string'],
            'approval_status' => ['nullable', 'string'],
        ]);
        $offboardingCase->update($data);

        return response()->json(['data' => ApiPresenter::offboardingCase($offboardingCase)]);
    }

    public function destroyOffboarding(OffboardingCase $offboardingCase)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $offboardingCase->delete();

        return response()->noContent();
    }
}
