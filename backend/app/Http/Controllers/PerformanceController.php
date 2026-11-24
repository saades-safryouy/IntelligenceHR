<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Goal;
use App\Models\PerformanceReview;
use App\Models\ReviewCycle;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PerformanceController extends Controller
{
    private const CYCLE_STATUSES = ['draft', 'active', 'closed'];
    private const REVIEW_STATUSES = ['draft', 'submitted'];
    private const GOAL_STATUSES = ['not_started', 'in_progress', 'completed'];

    /** Employee ids the current user may see records for (HR all, managers dept/subtree, others self). */
    private function allowedEmployeeIds(): array
    {
        return $this->scopeEmployees(Employee::query())->pluck('id')->all();
    }

    private function isHr(): bool
    {
        return $this->can('people.employee.create');
    }

    private function canManageEmployee(int $employeeId): bool
    {
        if ($this->isHr()) {
            return true;
        }
        if ($this->can('people.employee.view.department')) {
            return in_array($employeeId, $this->allowedEmployeeIds(), true);
        }
        $me = $this->myEmployee();

        return $me !== null && (int) $me->id === $employeeId;
    }

    // --- Review cycles (readable by all, managed by HR) ---

    public function indexCycles()
    {
        return response()->json(['data' => ReviewCycle::orderByDesc('period_start')->get()
            ->map(fn ($c) => ApiPresenter::reviewCycle($c))->values()->all()]);
    }

    public function storeCycle(Request $request)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'status' => ['nullable', 'string', Rule::in(self::CYCLE_STATUSES)],
        ]);
        $cycle = ReviewCycle::create([
            'title' => $data['title'],
            'period_start' => $data['period_start'],
            'period_end' => $data['period_end'],
            'status' => $data['status'] ?? 'draft',
        ]);
        $this->logAudit('review_cycle.created', 'review_cycle', $cycle->id, $cycle->title);

        return response()->json(['data' => ApiPresenter::reviewCycle($cycle)], 201);
    }

    public function updateCycle(Request $request, ReviewCycle $reviewCycle)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'period_start' => ['sometimes', 'required', 'date'],
            'period_end' => ['sometimes', 'required', 'date', 'after_or_equal:period_start'],
            'status' => ['nullable', 'string', Rule::in(self::CYCLE_STATUSES)],
        ]);
        $reviewCycle->update($data);
        $this->logAudit('review_cycle.updated', 'review_cycle', $reviewCycle->id, $reviewCycle->title);

        return response()->json(['data' => ApiPresenter::reviewCycle($reviewCycle)]);
    }

    public function destroyCycle(ReviewCycle $reviewCycle)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $reviewCycle->delete();
        $this->logAudit('review_cycle.deleted', 'review_cycle', $reviewCycle->id, $reviewCycle->title);

        return response()->noContent();
    }

    // --- Reviews (HR/managers write for their scope; employees read their own) ---

    public function indexReviews(Request $request)
    {
        $allowed = $this->allowedEmployeeIds();
        $me = $this->myEmployee();
        $query = PerformanceReview::with(['employee', 'reviewer', 'cycle'])
            ->where(function ($q) use ($allowed, $me) {
                $q->whereIn('employee_id', $allowed);
                if ($me) {
                    $q->orWhere('reviewer_id', $me->id);
                }
            });
        if ($request->filled('cycle_id')) {
            $query->where('cycle_id', (int) $request->integer('cycle_id'));
        }
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->integer('employee_id'));
        }

        return response()->json(['data' => $query->orderByDesc('created_at')->get()
            ->map(fn ($r) => ApiPresenter::performanceReview($r))->values()->all()]);
    }

    public function storeReview(Request $request)
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'cycle_id' => ['required', 'integer', 'exists:review_cycles,id'],
            'reviewer_id' => ['nullable', 'integer', 'exists:employees,id'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'strengths' => ['nullable', 'string'],
            'improvements' => ['nullable', 'string'],
            'feedback' => ['nullable', 'string'],
            'status' => ['nullable', 'string', Rule::in(self::REVIEW_STATUSES)],
        ]);
        if (! $this->canManageEmployee((int) $data['employee_id'])) {
            return $this->forbidden();
        }
        $review = PerformanceReview::create([
            'employee_id' => $data['employee_id'],
            'reviewer_id' => $data['reviewer_id'] ?? $this->myEmployee()?->id,
            'cycle_id' => $data['cycle_id'],
            'rating' => $data['rating'] ?? null,
            'strengths' => $data['strengths'] ?? null,
            'improvements' => $data['improvements'] ?? null,
            'feedback' => $data['feedback'] ?? null,
            'status' => $data['status'] ?? 'draft',
        ]);
        $review->load(['employee', 'reviewer', 'cycle']);
        $this->logAudit('performance_review.created', 'performance_review', $review->id, $review->employee?->fullName());

        return response()->json(['data' => ApiPresenter::performanceReview($review)], 201);
    }

    public function updateReview(Request $request, PerformanceReview $performanceReview)
    {
        $me = $this->myEmployee();
        $isReviewer = $me !== null && $performanceReview->reviewer_id !== null
            && (int) $performanceReview->reviewer_id === (int) $me->id;
        if (! $this->canManageEmployee((int) $performanceReview->employee_id) && ! $isReviewer) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'strengths' => ['nullable', 'string'],
            'improvements' => ['nullable', 'string'],
            'feedback' => ['nullable', 'string'],
            'status' => ['nullable', 'string', Rule::in(self::REVIEW_STATUSES)],
        ]);
        $performanceReview->update($data);
        $performanceReview->load(['employee', 'reviewer', 'cycle']);
        $this->logAudit('performance_review.updated', 'performance_review', $performanceReview->id, $performanceReview->employee?->fullName());

        return response()->json(['data' => ApiPresenter::performanceReview($performanceReview)]);
    }

    public function destroyReview(PerformanceReview $performanceReview)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $performanceReview->delete();
        $this->logAudit('performance_review.deleted', 'performance_review', $performanceReview->id, $performanceReview->employee?->fullName());

        return response()->noContent();
    }

    // --- Goals (HR/managers manage for their scope; employees manage their own) ---

    public function indexGoals(Request $request)
    {
        $allowed = $this->allowedEmployeeIds();
        $query = Goal::with('employee')->whereIn('employee_id', $allowed);
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->integer('employee_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return response()->json(['data' => $query->orderBy('target_date')->get()
            ->map(fn ($g) => ApiPresenter::goal($g))->values()->all()]);
    }

    public function storeGoal(Request $request)
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'target_date' => ['nullable', 'date'],
            'status' => ['nullable', 'string', Rule::in(self::GOAL_STATUSES)],
            'progress' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);
        if (! $this->canManageEmployee((int) $data['employee_id'])) {
            return $this->forbidden();
        }
        $goal = Goal::create([
            'employee_id' => $data['employee_id'],
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'target_date' => $data['target_date'] ?? null,
            'status' => $data['status'] ?? 'not_started',
            'progress' => $data['progress'] ?? 0,
        ]);
        $goal->load('employee');
        $this->logAudit('goal.created', 'goal', $goal->id, $goal->title);

        return response()->json(['data' => ApiPresenter::goal($goal)], 201);
    }

    public function updateGoal(Request $request, Goal $goal)
    {
        if (! $this->canManageEmployee((int) $goal->employee_id)) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'target_date' => ['nullable', 'date'],
            'status' => ['nullable', 'string', Rule::in(self::GOAL_STATUSES)],
            'progress' => ['sometimes', 'required', 'integer', 'min:0', 'max:100'],
        ]);
        $progress = $data['progress'] ?? $goal->progress;
        $status = $data['status'] ?? $goal->status;
        if ($progress >= 100) {
            $status = 'completed';
        } elseif ($status === 'completed' && $progress < 100) {
            $status = $progress > 0 ? 'in_progress' : 'not_started';
        }
        $goal->update(array_merge($data, [
            'status' => $status,
            'progress' => $status === 'completed' ? 100 : $progress,
        ]));
        $goal->load('employee');
        $this->logAudit('goal.updated', 'goal', $goal->id, $goal->title);

        return response()->json(['data' => ApiPresenter::goal($goal)]);
    }

    public function destroyGoal(Goal $goal)
    {
        $me = $this->myEmployee();
        $isOwner = $me !== null && (int) $goal->employee_id === (int) $me->id;
        if (! $this->isHr() && ! $isOwner) {
            return $this->forbidden();
        }
        $goal->delete();
        $this->logAudit('goal.deleted', 'goal', $goal->id, $goal->title);

        return response()->noContent();
    }
}
