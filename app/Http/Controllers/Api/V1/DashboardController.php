<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Services\EmployeeVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function statistics(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $user = $request->user();
        $employeeQuery = $visibility->query($user);

        $totalEmployees = (clone $employeeQuery)->count();
        $activeEmployees = (clone $employeeQuery)->where('status', 'Active')->count();
        $onLeaveCount = (clone $employeeQuery)->where('status', 'On Leave')->count();

        $hasViewAll = $user->hasPermission('people.employee.view.all');
        $authorizedEmployeeIds = $hasViewAll ? null : (clone $employeeQuery)->pluck('id');

        $onboardingQuery = OnboardingCase::query();
        if ($authorizedEmployeeIds !== null) {
            $onboardingQuery->whereIn('employee_id', $authorizedEmployeeIds);
        }
        $onboardingCases = $onboardingQuery->with('tasks')->orderByDesc('created_at')->get();
        $activeOnboarding = $onboardingCases->filter(fn($c) => $c->status !== 'Completed' && $c->stage !== 'Completed')->count();
        $onboardingAtRisk = $onboardingCases->filter(fn($c) => $c->status === 'At risk' || $c->status === 'Delayed')->count();

        $offboardingQuery = OffboardingCase::query();
        if ($authorizedEmployeeIds !== null) {
            $offboardingQuery->whereIn('employee_id', $authorizedEmployeeIds);
        }
        $offboardingCases = $offboardingQuery->orderByDesc('created_at')->get();
        $activeOffboarding = $offboardingCases->filter(fn($c) => $c->status !== 'Completed')->count();
        $offboardingOverdue = $offboardingCases->filter(fn($c) => $c->status === 'Overdue')->count();

        $leaveQuery = LeaveRequest::query();
        if ($authorizedEmployeeIds !== null) {
            $leaveQuery->whereIn('employee_id', $authorizedEmployeeIds);
        }
        $leaveRequests = $leaveQuery->with(['employee', 'leaveType', 'backupEmployee'])->orderByDesc('submitted_at')->get();
        $leavePending = $leaveRequests->filter(fn($r) => $r->status === 'pending')->count();

        $year = now()->year;
        $holidays = Holiday::whereYear('date', $year)->orderBy('date')->get();

        $employees = (clone $employeeQuery)->with(['department', 'team', 'position'])->get();

        return response()->json([
            'metrics' => [
                'totalEmployees' => $totalEmployees,
                'activeEmployees' => $activeEmployees,
                'onLeaveCount' => $onLeaveCount,
                'activeOnboarding' => $activeOnboarding,
                'onboardingAtRisk' => $onboardingAtRisk,
                'activeOffboarding' => $activeOffboarding,
                'offboardingOverdue' => $offboardingOverdue,
                'leavePending' => $leavePending,
            ],
            'employees' => $employees,
            'onboardingRequests' => $onboardingCases,
            'offboardingRequests' => $offboardingCases,
            'leaveRequests' => $leaveRequests,
            'holidays' => $holidays,
        ]);
    }
}
