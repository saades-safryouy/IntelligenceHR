<?php

namespace App\Http\Resources;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Employee */
class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $today = now()->toDateString();
        $relationship = $this->reportingRelationships
            ->first(fn ($record) => $record->is_primary
                && $record->effective_from?->toDateString() <= $today
                && ($record->effective_to === null || $record->effective_to->toDateString() >= $today));

        $ownRecord = $request->user()?->employee_id === $this->id;
        $canSeeSensitive = $ownRecord || $request->user()?->hasPermission('people.employee.sensitive.view');

        return [
            'id' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            'jobTitle' => $this->job_title,
            'departmentId' => $this->department_id,
            'department' => $this->department?->name,
            'teamId' => $this->team_id,
            'team' => $this->team?->name,
            'positionId' => $this->position_id,
            'position' => $this->position?->title,
            'managerId' => $relationship?->manager_employee_id,
            'manager' => $relationship?->manager
                ? $relationship->manager->first_name.' '.$relationship->manager->last_name
                : null,
            'employmentType' => $this->employment_type,
            'status' => $this->status,
            'location' => $this->location,
            'country' => $this->country,
            'joined' => $this->joined_at?->toDateString(),
            'email' => $this->user?->email ?? $this->email,
            'userId' => $this->user?->id,
            'nationalId' => $this->when($canSeeSensitive, $this->national_id),
            'passportNumber' => $this->when($canSeeSensitive, $this->passport_number),
            'passportValidityDate' => $this->when($canSeeSensitive, $this->passport_validity_date?->toDateString()),
            'gender' => $this->when($canSeeSensitive, $this->gender),
            'maritalStatus' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.family.view'), $this->marital_status),
            'numberOfChildren' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.family.view'), $this->number_of_children),
            'personalPhone' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.contact.view'), $this->personal_phone),
            'professionalPhone' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.contact.view'), $this->professional_phone),
            'personalInfoCompletedAt' => $this->personal_info_completed_at?->toISOString(),
            'personalInfoDismissedUntil' => $this->when($ownRecord, $this->personal_info_dismissed_until?->toDateString()),
            'onboardingStatus' => $this->whenLoaded('latestOnboardingCase', fn () => $this->latestOnboardingCase?->status),
            'onboardingApprovalStatus' => $this->whenLoaded('latestOnboardingCase', fn () => $this->latestOnboardingCase?->approval_status),
            'offboardingStatus' => $this->whenLoaded('latestOffboardingCase', fn () => $this->latestOffboardingCase?->status),
            'offboardingApprovalStatus' => $this->whenLoaded('latestOffboardingCase', fn () => $this->latestOffboardingCase?->approval_status),
            'documentStatusCounts' => $this->when(
                isset($this->documents_total_count),
                fn () => [
                    'total' => (int) $this->documents_total_count,
                    'missing' => (int) $this->documents_missing_count,
                    'pending' => (int) $this->documents_pending_count,
                    'approved' => (int) $this->documents_approved_count,
                    'rejected' => (int) $this->documents_rejected_count,
                    'archived' => (int) $this->documents_archived_count,
                    'expired' => (int) $this->documents_expired_count,
                ],
            ),
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
            'emergencyContactName' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.sensitive.view'), $this->emergency_contact_name),
            'emergencyContactPhone' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.sensitive.view'), $this->emergency_contact_phone),
            'emergencyContactRelationship' => $this->when($ownRecord || $request->user()?->hasPermission('people.employee.sensitive.view'), $this->emergency_contact_relationship),
        ];
    }
}
