<?php

namespace App\Support;

use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\CalendarEvent;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\Goal;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Notification;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\OnboardingTask;
use App\Models\PerformanceReview;
use App\Models\ReviewCycle;
use App\Models\TrainingCourse;
use App\Models\TrainingEnrollment;
use App\Models\User;
use App\Models\WorkflowDelegation;
use App\Models\WorkflowInstance;
use App\Models\WorkflowTemplate;

/**
 * Shapes every API response exactly as the React frontend expects them.
 * Source of truth: ~/workspace/hosting/intelligencehr/API_CONTRACT.md.
 * Mixed envelopes: single resources are {data: ...}, lists are either
 * {data: [...]} or a bare page {data, page, pageSize, total}.
 */
class ApiPresenter
{
    public static function principal(User $user): array
    {
        $employee = $user->employee_id ? Employee::find($user->employee_id) : null;

        return [
            'user' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'employeeId' => $user->employee_id,
            ],
            'employee' => $employee ? [
                'id' => $employee->id,
                'departmentId' => $employee->department_id,
                'positionId' => $employee->position_id,
            ] : null,
            'roles' => $user->roles ?? [],
        ];
    }

    public static function employee(Employee $e): array
    {
        $counts = ['total' => 0, 'missing' => 0, 'pending' => 0, 'approved' => 0, 'rejected' => 0, 'archived' => 0, 'expired' => 0];
        if ($e->relationLoaded('documents') || $e->documents()->exists()) {
            foreach ($e->documents as $d) {
                $counts['total']++;
                $status = $d->status;
                if ($status === 'expired' || ($d->expiry_date && $d->expiry_date->isPast() && $status === 'approved')) {
                    $counts['expired']++;
                } elseif (isset($counts[$status])) {
                    $counts[$status]++;
                }
            }
        }

        return [
            'id' => $e->id,
            'firstName' => $e->first_name,
            'lastName' => $e->last_name,
            'jobTitle' => $e->job_title,
            'departmentId' => $e->department_id,
            'department' => $e->department?->name,
            'team' => null,
            'teamId' => $e->team_id,
            'positionTitle' => $e->position_title,
            'position' => $e->position_title,
            'positionId' => $e->position_id,
            'managerId' => $e->manager_id,
            'manager' => $e->manager?->fullName(),
            'employmentType' => $e->employment_type,
            'status' => $e->status,
            'location' => $e->location,
            'country' => $e->country,
            'joined' => $e->joined_at?->toDateString(),
            'email' => $e->email,
            'userId' => $e->user_id ? (string) $e->user_id : null,
            'gender' => $e->gender,
            'maritalStatus' => $e->marital_status,
            'numberOfChildren' => $e->number_of_children,
            'nationalId' => $e->national_id,
            'nationalityId' => $e->nationality_id,
            'passportNumber' => $e->passport_number,
            'passportValidityDate' => $e->passport_validity_date?->toDateString(),
            'personalPhone' => $e->personal_phone,
            'professionalPhone' => $e->professional_phone,
            'personalInfoCompletedAt' => $e->personal_info_completed_at?->toISOString(),
            'personalInfoDismissedUntil' => $e->personal_info_dismissed_until?->toISOString(),
            'emergencyContactName' => $e->emergency_contact_name,
            'emergencyContactPhone' => $e->emergency_contact_phone,
            'emergencyContactRelationship' => $e->emergency_contact_relationship,
            'onboardingStatus' => $e->onboarding_status,
            'onboardingApprovalStatus' => $e->onboarding_approval_status,
            'offboardingStatus' => $e->offboarding_status,
            'offboardingApprovalStatus' => $e->offboarding_approval_status,
            'documentStatusCounts' => $counts,
            'createdAt' => $e->created_at?->toISOString(),
            'updatedAt' => $e->updated_at?->toISOString(),
        ];
    }

    public static function leaveRequest(LeaveRequest $r): array
    {
        return [
            'id' => (string) $r->id,
            'employee_id' => $r->employee_id,
            'employee' => $r->employee ? ['first_name' => $r->employee->first_name, 'last_name' => $r->employee->last_name] : null,
            'leave_type_id' => $r->leave_type_id,
            'leave_type' => $r->leaveType ? ['name_key' => $r->leaveType->name_key] : null,
            'start_date' => $r->start_date?->toDateString(),
            'end_date' => $r->end_date?->toDateString(),
            'from_half' => $r->from_half,
            'to_half' => $r->to_half,
            'duration' => (float) $r->duration,
            'backup_employee_id' => $r->backup_employee_id,
            'backup_employee' => $r->backupEmployee ? ['first_name' => $r->backupEmployee->first_name, 'last_name' => $r->backupEmployee->last_name] : null,
            'note' => $r->note,
            'status' => $r->status,
            'submitted_at' => $r->submitted_at?->toISOString(),
        ];
    }

    public static function leaveType(LeaveType $t, bool $withCode = false): array
    {
        $out = [
            'id' => $t->id,
            'name_key' => $t->name_key,
            'color' => $t->color,
            'paid' => (bool) $t->paid,
            'default_entitlement_days' => (int) ($t->default_entitlement_days ?? 0),
            'carry_over_days' => (int) ($t->carry_over_days ?? 0),
            'requires_approval' => (bool) ($t->requires_approval ?? true),
        ];
        if ($withCode) {
            $out = ['id' => $t->id, 'code' => $t->code] + $out;
        }

        return $out;
    }

    public static function department(Department $d): array
    {
        return [
            'id' => $d->id,
            'name' => $d->name,
            'code' => $d->code,
            'description' => $d->description,
            'manager' => $d->manager?->fullName(),
            'manager_id' => $d->manager_id,
            'employee_count' => $d->employee_count ?? $d->employees()->count(),
            'budget' => $d->budget !== null ? (string) $d->budget : '$0',
            'parent_id' => $d->parent_id,
            'is_active' => (bool) $d->is_active,
        ];
    }

    public static function auditLog(AuditLog $l): array
    {
        return [
            'id' => (string) $l->id,
            'user_id' => $l->user_id ? (string) $l->user_id : null,
            'user_name' => $l->user_name,
            'action' => $l->action,
            'resource_type' => $l->resource_type,
            'resource_id' => $l->resource_id,
            'details' => $l->details,
            'created_at' => $l->created_at?->toISOString(),
        ];
    }

    public static function attendanceRecord(AttendanceRecord $r): array
    {
        return [
            'id' => (string) $r->id,
            'employee_id' => $r->employee_id,
            'employee' => $r->employee ? $r->employee->first_name.' '.$r->employee->last_name : null,
            'date' => $r->date?->toDateString(),
            'check_in' => $r->check_in ? substr((string) $r->check_in, 0, 5) : null,
            'check_out' => $r->check_out ? substr((string) $r->check_out, 0, 5) : null,
            'status' => $r->status,
            'hours_worked' => $r->hours_worked !== null ? (float) $r->hours_worked : null,
            'validated' => (bool) $r->validated,
            'validated_by' => $r->validated_by ? (string) $r->validated_by : null,
            'notes' => $r->notes,
            'source' => 'record',
            'leave_request_id' => null,
            'created_at' => $r->created_at?->toISOString(),
            'updated_at' => $r->updated_at?->toISOString(),
        ];
    }

    /** Read-only row merged from an approved leave request (no duplicate data). */
    public static function attendanceLeaveRow(LeaveRequest $leave, string $date): array
    {
        return [
            'id' => 'leave-'.$leave->id.'-'.$date,
            'employee_id' => $leave->employee_id,
            'employee' => $leave->employee ? $leave->employee->first_name.' '.$leave->employee->last_name : null,
            'date' => $date,
            'check_in' => null,
            'check_out' => null,
            'status' => 'leave',
            'hours_worked' => null,
            'validated' => true,
            'validated_by' => null,
            'notes' => 'Approved leave'.($leave->leaveType ? ' ('.$leave->leaveType->name_key.')' : ''),
            'source' => 'leave',
            'leave_request_id' => (string) $leave->id,
            'created_at' => null,
            'updated_at' => null,
        ];
    }

    public static function reviewCycle(ReviewCycle $c): array
    {
        return [
            'id' => (string) $c->id,
            'title' => $c->title,
            'period_start' => $c->period_start?->toDateString(),
            'period_end' => $c->period_end?->toDateString(),
            'status' => $c->status,
            'reviews_count' => $c->reviews_count ?? $c->reviews()->count(),
            'created_at' => $c->created_at?->toISOString(),
            'updated_at' => $c->updated_at?->toISOString(),
        ];
    }

    public static function performanceReview(PerformanceReview $r): array
    {
        return [
            'id' => (string) $r->id,
            'employee_id' => $r->employee_id,
            'employee' => $r->employee ? $r->employee->first_name.' '.$r->employee->last_name : null,
            'reviewer_id' => $r->reviewer_id,
            'reviewer' => $r->reviewer ? $r->reviewer->first_name.' '.$r->reviewer->last_name : null,
            'cycle_id' => (string) $r->cycle_id,
            'cycle' => $r->cycle ? $r->cycle->title : null,
            'rating' => $r->rating !== null ? (int) $r->rating : null,
            'strengths' => $r->strengths,
            'improvements' => $r->improvements,
            'feedback' => $r->feedback,
            'status' => $r->status,
            'created_at' => $r->created_at?->toISOString(),
            'updated_at' => $r->updated_at?->toISOString(),
        ];
    }

    public static function goal(Goal $g): array
    {
        return [
            'id' => (string) $g->id,
            'employee_id' => $g->employee_id,
            'employee' => $g->employee ? $g->employee->first_name.' '.$g->employee->last_name : null,
            'title' => $g->title,
            'description' => $g->description,
            'target_date' => $g->target_date?->toDateString(),
            'status' => $g->status,
            'progress' => (int) $g->progress,
            'created_at' => $g->created_at?->toISOString(),
            'updated_at' => $g->updated_at?->toISOString(),
        ];
    }

    public static function calendarEvent(CalendarEvent $e): array
    {
        return [
            'id' => (string) $e->id,
            'user_id' => $e->user_id ? (string) $e->user_id : null,
            'title' => $e->title,
            'type' => $e->type,
            'start_date' => $e->start_date?->toDateString(),
            'end_date' => $e->end_date?->toDateString(),
            'note' => $e->note,
            'created_at' => $e->created_at?->toISOString(),
            'updated_at' => $e->updated_at?->toISOString(),
        ];
    }

    public static function trainingCourse(TrainingCourse $c): array
    {
        return [
            'id' => (string) $c->id,
            'title' => $c->title,
            'description' => $c->description,
            'category' => $c->category,
            'duration_hours' => (int) $c->duration_hours,
            'provider' => $c->provider,
            'status' => $c->status,
            'enrollments_count' => $c->enrollments_count ?? $c->enrollments()->count(),
            'created_at' => $c->created_at?->toISOString(),
            'updated_at' => $c->updated_at?->toISOString(),
        ];
    }

    public static function trainingEnrollment(TrainingEnrollment $e): array
    {
        return [
            'id' => (string) $e->id,
            'employee_id' => $e->employee_id,
            'employee' => $e->employee ? $e->employee->first_name.' '.$e->employee->last_name : null,
            'course_id' => (string) $e->course_id,
            'course' => $e->course ? $e->course->title : null,
            'status' => $e->status,
            'progress' => (int) $e->progress,
            'completed_at' => $e->completed_at?->toISOString(),
            'created_at' => $e->created_at?->toISOString(),
            'updated_at' => $e->updated_at?->toISOString(),
        ];
    }

    public static function user(User $u): array
    {
        return [
            'id' => (string) $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'roles' => $u->roles ?? [],
            'employee_id' => $u->employee_id,
            'employee' => $u->employee ? $u->employee->first_name.' '.$u->employee->last_name : null,
            'created_at' => $u->created_at?->toISOString(),
        ];
    }

    public static function holiday(Holiday $h): array
    {
        return [
            'id' => $h->id,
            'name' => $h->name,
            'name_key' => $h->name_key,
            'date' => $h->date?->toDateString(),
            'days' => $h->days,
            'recurring' => (bool) $h->recurring,
            'type' => $h->type,
            'country' => $h->country,
            'site' => $h->site,
        ];
    }

    public static function onboardingTask(OnboardingTask $t): array
    {
        return [
            'id' => $t->id,
            'label_key' => $t->label_key,
            'done' => (bool) $t->done,
            'due_date' => $t->due_date?->toDateString(),
            'employee_visible' => (bool) $t->employee_visible,
        ];
    }

    public static function onboardingCase(OnboardingCase $c): array
    {
        return [
            'id' => (string) $c->id,
            'employee_id' => $c->employee_id,
            'employee_name' => $c->employee_name,
            'position' => $c->position,
            'department' => $c->department,
            'start_date' => $c->start_date?->toDateString(),
            'stage' => $c->stage,
            'assignee' => $c->assignee,
            'progress' => $c->progress,
            'status' => $c->status,
            'approval_status' => $c->approval_status,
            'tasks' => $c->tasks->map(fn ($t) => self::onboardingTask($t))->values()->all(),
        ];
    }

    public static function offboardingCase(OffboardingCase $c): array
    {
        return [
            'id' => (string) $c->id,
            'employee_id' => $c->employee_id,
            'employee_name' => $c->employee_name,
            'exit_date' => $c->exit_date?->toDateString(),
            'reason' => $c->reason,
            'replacement' => $c->replacement,
            'stage' => $c->stage,
            'progress' => $c->progress,
            'status' => $c->status,
            'approval_status' => $c->approval_status,
        ];
    }

    public static function document(EmployeeDocument $d): array
    {
        return [
            'id' => (string) $d->id,
            'employee_id' => $d->employee_id,
            'employee' => $d->employee ? ['first_name' => $d->employee->first_name, 'last_name' => $d->employee->last_name] : null,
            'name' => $d->name,
            'type' => $d->type,
            'uploaded_at' => $d->uploaded_at?->toISOString(),
            'issue_date' => $d->issue_date?->toDateString(),
            'expiry_date' => $d->expiry_date?->toDateString(),
            'status' => $d->status,
            'has_file' => (bool) $d->has_file,
            'mime_type' => $d->mime_type,
            'file_size' => $d->file_size,
            'review_comment' => $d->review_comment,
            'reviewed_at' => $d->reviewed_at?->toISOString(),
            'workflow_instance' => null,
        ];
    }

    public static function workflowInstance(WorkflowInstance $i): array
    {
        $template = WorkflowTemplate::where('resource_type', $i->resource_type)->first();
        $version = $template?->publishedVersion;

        return [
            'id' => (string) $i->id,
            'initiator_user_id' => (string) $i->initiator_user_id,
            'resource_type' => $i->resource_type,
            'resource_id' => (string) $i->resource_id,
            'status' => $i->status,
            'submitted_at' => $i->submitted_at?->toISOString(),
            'completed_at' => $i->completed_at?->toISOString(),
            'created_at' => $i->created_at?->toISOString(),
            'updated_at' => $i->updated_at?->toISOString(),
            'initiator' => $i->initiator ? ['id' => (string) $i->initiator->id, 'name' => $i->initiator->name] : null,
            'version' => $version ? [
                'version_number' => $version->version_number,
                'template' => $template ? ['name' => $template->name, 'module' => $template->module, 'resource_type' => $template->resource_type] : null,
            ] : null,
            'steps' => $i->steps ?? [],
            'actions' => $i->actions->map(fn ($a) => [
                'id' => (string) $a->id,
                'action' => $a->action,
                'comment' => $a->comment,
                'actor_user_id' => (string) $a->actor_user_id,
                'occurred_at' => $a->occurred_at?->toISOString(),
                'actor' => $a->actor ? ['id' => (string) $a->actor->id, 'name' => $a->actor->name] : null,
            ])->values()->all(),
        ];
    }

    public static function workflowTemplate(WorkflowTemplate $t): array
    {
        return [
            'id' => (string) $t->id,
            'key' => $t->key,
            'module' => $t->module,
            'resource_type' => $t->resource_type,
            'name' => $t->name,
            'is_active' => (bool) $t->is_active,
            'versions' => $t->versions->map(fn ($v) => [
                'id' => (string) $v->id,
                'version_number' => $v->version_number,
                'status' => $v->status,
                'published_at' => $v->published_at?->toISOString(),
            ])->values()->all(),
        ];
    }

    public static function delegation(WorkflowDelegation $d): array
    {
        return [
            'id' => (string) $d->id,
            'delegator_user_id' => (string) $d->delegator_user_id,
            'delegate_user_id' => (string) $d->delegate_user_id,
            'approval_assignment_id' => $d->approval_assignment_id,
            'starts_at' => $d->starts_at?->toISOString(),
            'ends_at' => $d->ends_at?->toISOString(),
            'revoked_at' => $d->revoked_at?->toISOString(),
            'delegator' => $d->delegator ? ['id' => (string) $d->delegator->id, 'name' => $d->delegator->name] : null,
            'delegate' => $d->delegate ? ['id' => (string) $d->delegate->id, 'name' => $d->delegate->name] : null,
            'assignment' => null,
        ];
    }

    public static function notification(Notification $n): array
    {
        return [
            'id' => (string) $n->id,
            'title' => $n->title,
            'body' => $n->body,
            'type' => $n->type,
            'resource_type' => $n->resource_type,
            'resource_id' => $n->resource_id ? (string) $n->resource_id : null,
            'created_at' => $n->created_at?->toISOString(),
            'read_at' => $n->read_at?->toISOString(),
        ];
    }

    /** Bare page the frontend reads as {data, page, pageSize, total}. */
    public static function page(array $items, int $page, int $pageSize, int $total): array
    {
        return ['data' => $items, 'page' => $page, 'pageSize' => $pageSize, 'total' => $total];
    }

    /**
     * Leave-requests list: bare paginated page. Includes both the
     * {page, pageSize, total} keys the manager dashboard reads AND a
     * Laravel-style `meta` block (see README § "Ambiguity decisions").
     */
    public static function paginatedPage(array $items, int $page, int $pageSize, int $total): array
    {
        $lastPage = max(1, (int) ceil($total / max(1, $pageSize)));

        return [
            'data' => $items,
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $total,
            'meta' => [
                'current_page' => $page,
                'per_page' => $pageSize,
                'total' => $total,
                'last_page' => $lastPage,
                'from' => $total === 0 ? null : ($page - 1) * $pageSize + 1,
                'to' => min($total, $page * $pageSize),
            ],
        ];
    }
}
