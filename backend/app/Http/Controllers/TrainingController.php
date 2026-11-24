<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\TrainingCourse;
use App\Models\TrainingEnrollment;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TrainingController extends Controller
{
    private const COURSE_STATUSES = ['active', 'archived'];
    private const ENROLLMENT_STATUSES = ['enrolled', 'in_progress', 'completed'];

    /** Employee ids the current user may see records for (HR all, managers dept/subtree, others self). */
    private function allowedEmployeeIds(): array
    {
        return $this->scopeEmployees(Employee::query())->pluck('id')->all();
    }

    private function isHr(): bool
    {
        return $this->can('people.employee.create');
    }

    // --- Courses: the catalog is readable by every authenticated user. ---

    public function indexCourses()
    {
        $courses = TrainingCourse::withCount('enrollments')->orderBy('title')->get();

        return response()->json(['data' => $courses
            ->map(fn ($c) => ApiPresenter::trainingCourse($c))->values()->all()]);
    }

    public function storeCourse(Request $request)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category' => ['nullable', 'string', 'max:100'],
            'duration_hours' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'provider' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', Rule::in(self::COURSE_STATUSES)],
        ]);
        $course = TrainingCourse::create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'category' => $data['category'] ?? 'General',
            'duration_hours' => $data['duration_hours'] ?? 0,
            'provider' => $data['provider'] ?? null,
            'status' => $data['status'] ?? 'active',
        ]);
        $this->logAudit('training_course.created', 'training_course', $course->id, $course->title);

        return response()->json(['data' => ApiPresenter::trainingCourse($course)], 201);
    }

    public function updateCourse(Request $request, TrainingCourse $trainingCourse)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category' => ['nullable', 'string', 'max:100'],
            'duration_hours' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'provider' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', Rule::in(self::COURSE_STATUSES)],
        ]);
        $trainingCourse->update($data);
        $this->logAudit('training_course.updated', 'training_course', $trainingCourse->id, $trainingCourse->title);

        return response()->json(['data' => ApiPresenter::trainingCourse($trainingCourse)]);
    }

    public function destroyCourse(TrainingCourse $trainingCourse)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $trainingCourse->delete();
        $this->logAudit('training_course.deleted', 'training_course', $trainingCourse->id, $trainingCourse->title);

        return response()->noContent();
    }

    // --- Enrollments: scoped to what the user may see. ---

    public function indexEnrollments(Request $request)
    {
        $allowed = $this->allowedEmployeeIds();
        $query = TrainingEnrollment::with(['employee', 'course'])->whereIn('employee_id', $allowed);
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->integer('employee_id'));
        }
        if ($request->filled('course_id')) {
            $query->where('course_id', (int) $request->integer('course_id'));
        }

        return response()->json(['data' => $query->orderByDesc('created_at')->get()
            ->map(fn ($e) => ApiPresenter::trainingEnrollment($e))->values()->all()]);
    }

    public function storeEnrollment(Request $request)
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'course_id' => ['required', 'integer', 'exists:training_courses,id'],
        ]);
        $course = TrainingCourse::findOrFail($data['course_id']);
        if ($course->status !== 'active') {
            return response()->json(['message' => 'This course is archived.'], 422);
        }
        $me = $this->myEmployee();
        if (! $this->isHr() && (! $me || (int) $me->id !== (int) $data['employee_id'])) {
            return $this->forbidden();
        }
        if (TrainingEnrollment::where('employee_id', $data['employee_id'])
            ->where('course_id', $data['course_id'])->exists()) {
            return response()->json(['message' => 'This employee is already enrolled in this course.'], 422);
        }
        $enrollment = TrainingEnrollment::create([
            'employee_id' => $data['employee_id'],
            'course_id' => $data['course_id'],
            'status' => 'enrolled',
            'progress' => 0,
        ]);
        $enrollment->load(['employee', 'course']);
        $this->logAudit('training_enrollment.created', 'training_enrollment', $enrollment->id, $course->title);

        return response()->json(['data' => ApiPresenter::trainingEnrollment($enrollment)], 201);
    }

    public function updateEnrollment(Request $request, TrainingEnrollment $trainingEnrollment)
    {
        $me = $this->myEmployee();
        if (! $this->isHr() && (! $me || (int) $trainingEnrollment->employee_id !== (int) $me->id)) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'status' => ['sometimes', 'required', 'string', Rule::in(self::ENROLLMENT_STATUSES)],
            'progress' => ['sometimes', 'required', 'integer', 'min:0', 'max:100'],
        ]);
        // Progress is manual (set on completion steps): 100% means completed.
        $progress = $data['progress'] ?? $trainingEnrollment->progress;
        $status = $data['status'] ?? $trainingEnrollment->status;
        if ($progress >= 100) {
            $status = 'completed';
        } elseif ($status === 'completed' && $progress < 100) {
            $status = $progress > 0 ? 'in_progress' : 'enrolled';
        }
        $trainingEnrollment->update([
            'status' => $status,
            'progress' => $status === 'completed' ? 100 : $progress,
            'completed_at' => $status === 'completed'
                ? ($trainingEnrollment->completed_at ?? now())
                : null,
        ]);
        $trainingEnrollment->load(['employee', 'course']);
        $this->logAudit('training_enrollment.updated', 'training_enrollment', $trainingEnrollment->id, $trainingEnrollment->course?->title);

        return response()->json(['data' => ApiPresenter::trainingEnrollment($trainingEnrollment)]);
    }

    public function destroyEnrollment(TrainingEnrollment $trainingEnrollment)
    {
        $me = $this->myEmployee();
        if (! $this->isHr() && (! $me || (int) $trainingEnrollment->employee_id !== (int) $me->id)) {
            return $this->forbidden();
        }
        $trainingEnrollment->delete();
        $this->logAudit('training_enrollment.deleted', 'training_enrollment', $trainingEnrollment->id, $trainingEnrollment->course?->title);

        return response()->noContent();
    }
}
