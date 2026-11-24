<?php

namespace App\Http\Controllers;

use App\Models\Candidate;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Interview;
use App\Models\Job;
use App\Models\JobApplication;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use App\Support\ApiPresenter;
use App\Support\WorkflowStarter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class RecruitmentController extends Controller
{
    private const JOB_STATUSES = ['open', 'closed'];
    private const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
    private const OUTCOMES = ['pending', 'passed', 'failed'];

    private function isHr(): bool
    {
        return $this->can('people.employee.create');
    }

    /** Department ids the current manager oversees (own department; departments are flat). */
    private function managedDepartmentIds(): array
    {
        $me = $this->myEmployee();
        if ($me === null || $me->department_id === null) {
            return [];
        }

        return [$me->department_id];
    }

    /** Application query scoped for the current user (HR all, managers their departments). */
    private function scopedApplications()
    {
        $query = JobApplication::with(['job', 'candidate']);
        if ($this->isHr()) {
            return $query;
        }
        if ($this->can('people.employee.view.department')) {
            $deptIds = $this->managedDepartmentIds();

            return $query->whereHas('job', fn ($q) => $q->whereIn('department_id', $deptIds));
        }

        return $query->whereRaw('1 = 0');
    }

    private function canSeeApplication(JobApplication $application): bool
    {
        if ($this->isHr()) {
            return true;
        }
        if ($this->can('people.employee.view.department')) {
            return in_array($application->job->department_id, $this->managedDepartmentIds(), true);
        }

        return false;
    }

    // --- Jobs (readable by all, managed by HR) ---

    public function indexJobs(Request $request)
    {
        $query = Job::with('department')->orderByDesc('created_at');
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('department_id')) {
            $query->where('department_id', $request->input('department_id'));
        }

        return response()->json(['data' => $query->get()
            ->map(fn ($j) => ApiPresenter::job($j))->values()->all()]);
    }

    public function storeJob(Request $request)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'department_id' => ['required', 'string', 'exists:departments,id'],
            'description' => ['nullable', 'string'],
            'location' => ['nullable', 'string', 'max:255'],
            'employment_type' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', Rule::in(self::JOB_STATUSES)],
        ]);
        $job = Job::create([
            'title' => $data['title'],
            'department_id' => $data['department_id'],
            'description' => $data['description'] ?? null,
            'location' => $data['location'] ?? 'Casablanca',
            'employment_type' => $data['employment_type'] ?? 'Full-time',
            'status' => $data['status'] ?? 'open',
        ]);
        $job->load('department');
        $this->logAudit('job.created', 'job', $job->id, $job->title);

        return response()->json(['data' => ApiPresenter::job($job)], 201);
    }

    public function updateJob(Request $request, Job $job)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'department_id' => ['sometimes', 'required', 'string', 'exists:departments,id'],
            'description' => ['nullable', 'string'],
            'location' => ['nullable', 'string', 'max:255'],
            'employment_type' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', Rule::in(self::JOB_STATUSES)],
        ]);
        $job->update($data);
        $job->load('department');
        $this->logAudit('job.updated', 'job', $job->id, $job->title);

        return response()->json(['data' => ApiPresenter::job($job)]);
    }

    public function destroyJob(Job $job)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $job->delete();
        $this->logAudit('job.deleted', 'job', $job->id, $job->title);

        return response()->noContent();
    }

    // --- Candidates (HR only — personal data) ---

    public function indexCandidates()
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }

        return response()->json(['data' => Candidate::orderByDesc('created_at')->get()
            ->map(fn ($c) => ApiPresenter::candidate($c))->values()->all()]);
    }

    public function storeCandidate(Request $request)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:candidates,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'cv' => ['nullable', 'file', 'max:20480'],
        ]);
        $candidate = Candidate::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
        ]);
        if ($request->hasFile('cv')) {
            $this->attachCv($candidate, $request->file('cv'));
        }
        $this->logAudit('candidate.created', 'candidate', $candidate->id, $candidate->name);

        return response()->json(['data' => ApiPresenter::candidate($candidate)], 201);
    }

    public function updateCandidate(Request $request, Candidate $candidate)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('candidates', 'email')->ignore($candidate->id)],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);
        $candidate->update($data);
        $this->logAudit('candidate.updated', 'candidate', $candidate->id, $candidate->name);

        return response()->json(['data' => ApiPresenter::candidate($candidate)]);
    }

    public function destroyCandidate(Candidate $candidate)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        if ($candidate->cv_path) {
            Storage::disk('public')->delete($candidate->cv_path);
        }
        $candidate->delete();
        $this->logAudit('candidate.deleted', 'candidate', $candidate->id, $candidate->name);

        return response()->noContent();
    }

    public function uploadCv(Request $request, Candidate $candidate)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $request->validate(['cv' => ['required', 'file', 'max:20480']]);
        if ($candidate->cv_path) {
            Storage::disk('public')->delete($candidate->cv_path);
        }
        $this->attachCv($candidate, $request->file('cv'));
        $this->logAudit('candidate.cv_uploaded', 'candidate', $candidate->id, $candidate->name);

        return response()->json(['data' => ApiPresenter::candidate($candidate)]);
    }

    public function downloadCv(Candidate $candidate)
    {
        $application = JobApplication::with('job')->where('candidate_id', $candidate->id)->first();
        if (! $this->isHr() && ($application === null || ! $this->canSeeApplication($application))) {
            return $this->forbidden();
        }
        if (! $candidate->cv_path || ! Storage::disk('public')->exists($candidate->cv_path)) {
            return response()->json(['message' => 'No CV on file for this candidate.'], 404);
        }

        return Storage::disk('public')->download(
            $candidate->cv_path,
            basename($candidate->cv_path)
        );
    }

    private function attachCv(Candidate $candidate, $file): void
    {
        $path = $file->storeAs(
            'cvs/'.$candidate->id,
            time().'_'.preg_replace('/[^A-Za-z0-9._-]/', '_', $file->getClientOriginalName()),
            'public'
        );
        $candidate->update([
            'cv_path' => $path,
            'cv_mime' => $file->getClientMimeType(),
            'cv_size' => $file->getSize(),
        ]);
    }

    // --- Applications ---

    public function indexApplications(Request $request)
    {
        $query = $this->scopedApplications();
        if ($request->filled('job_id')) {
            $query->where('job_id', (int) $request->integer('job_id'));
        }
        if ($request->filled('stage')) {
            $query->where('stage', $request->input('stage'));
        }

        return response()->json(['data' => $query->orderByDesc('created_at')->get()
            ->map(fn ($a) => ApiPresenter::jobApplication($a))->values()->all()]);
    }

    public function storeApplication(Request $request)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'job_id' => ['required', 'integer', 'exists:jobs,id'],
            'candidate_id' => ['nullable', 'integer', 'exists:candidates,id'],
            'candidate_name' => ['nullable', 'string', 'max:255'],
            'candidate_email' => ['nullable', 'email', 'max:255'],
            'candidate_phone' => ['nullable', 'string', 'max:50'],
            'stage' => ['nullable', 'string', Rule::in(self::STAGES)],
            'notes' => ['nullable', 'string'],
        ]);
        if (empty($data['candidate_id'])) {
            $request->validate([
                'candidate_name' => ['required', 'string', 'max:255'],
                'candidate_email' => ['required', 'email', 'max:255'],
            ]);
            $candidate = Candidate::firstOrCreate(
                ['email' => $data['candidate_email']],
                ['name' => $data['candidate_name'], 'phone' => $data['candidate_phone'] ?? null]
            );
            $data['candidate_id'] = $candidate->id;
        }
        $application = JobApplication::create([
            'job_id' => $data['job_id'],
            'candidate_id' => $data['candidate_id'],
            'stage' => $data['stage'] ?? 'applied',
            'notes' => $data['notes'] ?? null,
        ]);
        $application->load(['job', 'candidate']);
        $this->logAudit('job_application.created', 'job_application', $application->id, $application->candidate?->name);

        return response()->json(['data' => ApiPresenter::jobApplication($application)], 201);
    }

    public function updateApplication(Request $request, JobApplication $jobApplication)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'stage' => ['nullable', 'string', Rule::in(self::STAGES)],
            'notes' => ['nullable', 'string'],
        ]);
        $jobApplication->update($data);
        if (($data['stage'] ?? null) === 'hired' && $jobApplication->onboarding_case_id === null) {
            $this->hireCandidate($jobApplication);
        }
        $jobApplication->load(['job', 'candidate']);
        $this->logAudit('job_application.updated', 'job_application', $jobApplication->id, $jobApplication->candidate?->name);

        return response()->json(['data' => ApiPresenter::jobApplication($jobApplication)]);
    }

    public function destroyApplication(JobApplication $jobApplication)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $jobApplication->delete();
        $this->logAudit('job_application.deleted', 'job_application', $jobApplication->id, $jobApplication->candidate?->name);

        return response()->noContent();
    }

    /**
     * Hiring: create an Employee from the candidate (unless one with that email
     * already exists) and a linked onboarding case with the default checklist.
     * No login User account is created — HR creates accounts separately.
     */
    private function hireCandidate(JobApplication $application): void
    {
        $application->loadMissing(['job', 'candidate']);
        $candidate = $application->candidate;
        $job = $application->job;
        if ($candidate === null || $job === null) {
            return;
        }
        $name = trim($candidate->name);
        $space = strpos($name, ' ');
        $firstName = $space === false ? $name : substr($name, 0, $space);
        $lastName = $space === false ? '' : trim(substr($name, $space + 1));
        $employee = Employee::firstOrCreate(
            ['email' => $candidate->email],
            [
                'first_name' => $firstName,
                'last_name' => $lastName,
                'job_title' => $job->title,
                'department_id' => $job->department_id,
                'location' => $job->location,
                'employment_type' => $job->employment_type,
                'status' => 'Active',
                'joined_at' => now()->toDateString(),
            ]
        );
        $department = Department::find($job->department_id);
        $case = OnboardingCase::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->fullName(),
            'position' => $job->title,
            'department' => $department?->name,
            'start_date' => now()->toDateString(),
            'stage' => 'HR Validation',
            'progress' => 0,
            'status' => 'On track',
        ]);
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
        WorkflowStarter::startFor('onboarding_case', (string) $case->id, (string) $this->user()->id, $employee->fullName());
        $application->update(['onboarding_case_id' => $case->id]);
        $this->logAudit('job_application.hired', 'job_application', $application->id, $candidate->name);
    }

    // --- Interviews (HR manages; managers read their departments') ---

    public function indexInterviews(Request $request)
    {
        $query = Interview::with('application.job', 'application.candidate');
        if (! $this->isHr()) {
            if ($this->can('people.employee.view.department')) {
                $deptIds = $this->managedDepartmentIds();
                $query->whereHas('application.job', fn ($q) => $q->whereIn('department_id', $deptIds));
            } else {
                $query->whereRaw('1 = 0');
            }
        }
        if ($request->filled('application_id')) {
            $query->where('application_id', (int) $request->integer('application_id'));
        }

        return response()->json(['data' => $query->orderBy('scheduled_at')->get()
            ->map(fn ($i) => ApiPresenter::interview($i))->values()->all()]);
    }

    public function storeInterview(Request $request)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'application_id' => ['required', 'integer', 'exists:job_applications,id'],
            'scheduled_at' => ['required', 'date'],
            'interviewer' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'outcome' => ['nullable', 'string', Rule::in(self::OUTCOMES)],
        ]);
        $interview = Interview::create([
            'application_id' => $data['application_id'],
            'scheduled_at' => $data['scheduled_at'],
            'interviewer' => $data['interviewer'] ?? null,
            'notes' => $data['notes'] ?? null,
            'outcome' => $data['outcome'] ?? 'pending',
        ]);
        $interview->load('application.job', 'application.candidate');
        $this->logAudit('interview.created', 'interview', $interview->id, $interview->interviewer);

        return response()->json(['data' => ApiPresenter::interview($interview)], 201);
    }

    public function updateInterview(Request $request, Interview $interview)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'scheduled_at' => ['sometimes', 'required', 'date'],
            'interviewer' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'outcome' => ['nullable', 'string', Rule::in(self::OUTCOMES)],
        ]);
        $interview->update($data);
        $interview->load('application.job', 'application.candidate');
        $this->logAudit('interview.updated', 'interview', $interview->id, $interview->interviewer);

        return response()->json(['data' => ApiPresenter::interview($interview)]);
    }

    public function destroyInterview(Interview $interview)
    {
        if (! $this->isHr()) {
            return $this->forbidden();
        }
        $interview->delete();
        $this->logAudit('interview.deleted', 'interview', $interview->id, $interview->interviewer);

        return response()->noContent();
    }
}
