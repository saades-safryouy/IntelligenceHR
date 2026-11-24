<?php

use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\CalendarEventController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\HolidayController;
use App\Http\Controllers\LeaveController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\TrainingController;
use App\Http\Controllers\WorkflowController;
use Illuminate\Support\Facades\Route;

/*
 * IntelligenceHR API — all routes under /api/v1.
 * Auth is Sanctum cookie sessions (GET /sanctum/csrf-cookie first,
 * X-XSRF-TOKEN header, credentials:include). No Bearer tokens.
 * Envelopes are mixed per the API contract: single resources {data},
 * some lists bare {data, page, pageSize, total}.
 */

Route::prefix('v1')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::get('me/permissions', [AuthController::class, 'permissions']);

        // Users & roles admin (HR only, enforced in the controller)
        Route::get('users', [UserController::class, 'index']);
        Route::patch('users/{user}', [UserController::class, 'update']);
        Route::get('roles', [UserController::class, 'roles']);

        // Employees — /summary must be registered before /{employee}.
        Route::get('employees/summary', [EmployeeController::class, 'summary']);
        Route::get('employees', [EmployeeController::class, 'index']);
        Route::post('employees', [EmployeeController::class, 'store']);
        Route::get('employees/{employee}', [EmployeeController::class, 'show']);
        Route::patch('employees/{employee}', [EmployeeController::class, 'update']);
        Route::delete('employees/{employee}', [EmployeeController::class, 'destroy']);
        Route::put('employees/{employee}/reporting-relationships', [EmployeeController::class, 'reportingRelationships']);

        // Leave
        Route::get('leave-requests', [LeaveController::class, 'index']);
        Route::post('leave-requests', [LeaveController::class, 'store']);
        Route::delete('leave-requests/{leaveRequest}', [LeaveController::class, 'destroy']);
        Route::get('leave-types', [LeaveController::class, 'leaveTypes']);
        Route::post('leave-types', [LeaveController::class, 'storeLeaveType']);
        Route::put('leave-types/{leaveType}', [LeaveController::class, 'updateLeaveType']);
        Route::delete('leave-types/{leaveType}', [LeaveController::class, 'destroyLeaveType']);

        // Departments
        Route::get('departments', [DepartmentController::class, 'index']);
        Route::post('departments', [DepartmentController::class, 'store']);
        Route::put('departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('departments/{department}', [DepartmentController::class, 'destroy']);

        // Holidays
        Route::get('holidays', [HolidayController::class, 'index']);
        Route::post('holidays', [HolidayController::class, 'store']);
        Route::put('holidays/{holiday}', [HolidayController::class, 'update']);
        Route::delete('holidays/{holiday}', [HolidayController::class, 'destroy']);

        // Onboarding / offboarding
        Route::get('onboarding-cases', [OnboardingController::class, 'indexOnboarding']);
        Route::post('onboarding-cases', [OnboardingController::class, 'storeOnboarding']);
        Route::get('onboarding-cases/{onboardingCase}', [OnboardingController::class, 'showOnboarding']);
        Route::patch('onboarding-cases/{onboardingCase}', [OnboardingController::class, 'updateOnboarding']);
        Route::delete('onboarding-cases/{onboardingCase}', [OnboardingController::class, 'destroyOnboarding']);
        Route::patch('onboarding-tasks/{onboardingTask}', [OnboardingController::class, 'toggleTask']);
        Route::get('offboarding-cases', [OnboardingController::class, 'indexOffboarding']);
        Route::post('offboarding-cases', [OnboardingController::class, 'storeOffboarding']);
        Route::get('offboarding-cases/{offboardingCase}', [OnboardingController::class, 'showOffboarding']);
        Route::patch('offboarding-cases/{offboardingCase}', [OnboardingController::class, 'updateOffboarding']);
        Route::delete('offboarding-cases/{offboardingCase}', [OnboardingController::class, 'destroyOffboarding']);

        // Employee documents (incl. file upload / download / review / archive)
        Route::get('employee-documents', [DocumentController::class, 'index']);
        Route::post('employee-documents', [DocumentController::class, 'store']);
        Route::get('employee-documents/{employeeDocument}', [DocumentController::class, 'show']);
        Route::patch('employee-documents/{employeeDocument}', [DocumentController::class, 'update']);
        Route::delete('employee-documents/{employeeDocument}', [DocumentController::class, 'destroy']);
        Route::post('employee-documents/{employeeDocument}/file', [DocumentController::class, 'uploadFile']);
        Route::get('employee-documents/{employeeDocument}/file', [DocumentController::class, 'download']);
        Route::post('employee-documents/{employeeDocument}/review', [DocumentController::class, 'review']);
        Route::post('employee-documents/{employeeDocument}/archive', [DocumentController::class, 'archive']);

        // Workflow
        Route::get('workflow-instances', [WorkflowController::class, 'indexInstances']);
        Route::get('workflow-instances/{workflowInstance}', [WorkflowController::class, 'showInstance']);
        Route::get('workflow-instances/{workflowInstance}/resource', [WorkflowController::class, 'resource']);
        Route::get('workflow-instances/{workflowInstance}/history', [WorkflowController::class, 'history']);
        Route::post('workflow-instances/{workflowInstance}/actions', [WorkflowController::class, 'action']);
        Route::get('workflow-templates', [WorkflowController::class, 'indexTemplates']);
        Route::post('workflow-templates', [WorkflowController::class, 'storeTemplate']);
        Route::post('workflow-templates/{workflowTemplate}/versions', [WorkflowController::class, 'storeVersion']);
        Route::post('workflow-template-versions/{version}/publish', [WorkflowController::class, 'publishVersion']);
        Route::get('workflow-delegations', [WorkflowController::class, 'indexDelegations']);
        Route::post('workflow-delegations', [WorkflowController::class, 'storeDelegation']);
        Route::delete('workflow-delegations/{workflowDelegation}', [WorkflowController::class, 'destroyDelegation']);

        // Notifications
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::patch('notifications/{notification}/read', [NotificationController::class, 'read']);
        Route::post('notifications/read', [NotificationController::class, 'readMany']);

        // Calendar custom events (owner-scoped, HR sees all)
        Route::get('calendar-events', [CalendarEventController::class, 'index']);
        Route::post('calendar-events', [CalendarEventController::class, 'store']);
        Route::patch('calendar-events/{calendarEvent}', [CalendarEventController::class, 'update']);
        Route::delete('calendar-events/{calendarEvent}', [CalendarEventController::class, 'destroy']);

        // Audit log
        Route::get('audit-logs', [AuditLogController::class, 'index']);

        // Training
        Route::get('training-courses', [TrainingController::class, 'indexCourses']);
        Route::post('training-courses', [TrainingController::class, 'storeCourse']);
        Route::put('training-courses/{trainingCourse}', [TrainingController::class, 'updateCourse']);
        Route::delete('training-courses/{trainingCourse}', [TrainingController::class, 'destroyCourse']);
        Route::get('training-enrollments', [TrainingController::class, 'indexEnrollments']);
        Route::post('training-enrollments', [TrainingController::class, 'storeEnrollment']);
        Route::patch('training-enrollments/{trainingEnrollment}', [TrainingController::class, 'updateEnrollment']);
        Route::delete('training-enrollments/{trainingEnrollment}', [TrainingController::class, 'destroyEnrollment']);

        // Org chart, dashboards, analytics
        Route::get('org-chart', [DashboardController::class, 'orgChart']);
        Route::get('dashboard/statistics', [DashboardController::class, 'statistics']);
        Route::get('analytics/overview', [DashboardController::class, 'analytics']);
    });
});
