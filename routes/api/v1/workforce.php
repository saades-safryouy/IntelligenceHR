<?php

use App\Http\Controllers\Api\V1\DocumentController;
use App\Http\Controllers\Api\V1\HolidayController;
use App\Http\Controllers\Api\V1\LeaveController;
use App\Http\Controllers\Api\V1\OffboardingController;
use App\Http\Controllers\Api\V1\OnboardingController;
use App\Support\Permissions;
use Illuminate\Support\Facades\Route;

// Leave Management
Route::get('/leave-types', [LeaveController::class, 'types'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/leave-entitlements', [LeaveController::class, 'entitlements'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/leave-requests', [LeaveController::class, 'index'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/leave-requests/{leaveRequest}', [LeaveController::class, 'show'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/leave-requests', [LeaveController::class, 'store'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

Route::patch('/leave-requests/{leaveRequest}/status', [LeaveController::class, 'updateStatus'])
    ->middleware(Permissions::any('people.employee.update'));

Route::delete('/leave-requests/{leaveRequest}', [LeaveController::class, 'destroy'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

// Holidays
Route::get('/holidays', [HolidayController::class, 'index'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/holidays', [HolidayController::class, 'store'])
    ->middleware(Permissions::any('people.catalog.manage'));

// Lifecycle: Onboarding
Route::get('/onboarding-cases', [OnboardingController::class, 'index'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/onboarding-cases', [OnboardingController::class, 'store'])
    ->middleware(Permissions::any('people.employee.create'));

Route::get('/onboarding-cases/{onboardingCase}', [OnboardingController::class, 'show'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::patch('/onboarding-cases/{onboardingCase}', [OnboardingController::class, 'update'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

Route::post('/onboarding-cases/{onboardingCase}/stage', [OnboardingController::class, 'updateStage'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

Route::delete('/onboarding-cases/{onboardingCase}', [OnboardingController::class, 'destroy'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

Route::patch('/onboarding-tasks/{task}', [OnboardingController::class, 'updateTask'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

// Lifecycle: Offboarding
Route::get('/offboarding-cases', [OffboardingController::class, 'index'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/offboarding-cases', [OffboardingController::class, 'store'])
    ->middleware(Permissions::any('people.employee.create'));

Route::get('/offboarding-cases/{offboardingCase}', [OffboardingController::class, 'show'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::patch('/offboarding-cases/{offboardingCase}', [OffboardingController::class, 'update'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

Route::delete('/offboarding-cases/{offboardingCase}', [OffboardingController::class, 'destroy'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

// Employee Documents
Route::get('/employee-documents', [DocumentController::class, 'index'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/employee-documents', [DocumentController::class, 'store'])
    ->middleware(Permissions::any(Permissions::DOCUMENT_UPLOAD));

Route::get('/employee-documents/{employeeDocument}', [DocumentController::class, 'show'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/employee-documents/{employeeDocument}/file', [DocumentController::class, 'download'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/employee-documents/{employeeDocument}/file', [DocumentController::class, 'upload'])
    ->middleware(Permissions::any(Permissions::DOCUMENT_UPLOAD));

Route::post('/employee-documents/{employeeDocument}/review', [DocumentController::class, 'review'])
    ->middleware(Permissions::any(Permissions::DOCUMENT_REVIEW));

Route::post('/employee-documents/{employeeDocument}/archive', [DocumentController::class, 'archive'])
    ->middleware(Permissions::any(Permissions::DOCUMENT_ARCHIVE));

Route::patch('/employee-documents/{employeeDocument}', [DocumentController::class, 'update'])
    ->middleware(Permissions::any('people.employee.update'));

Route::delete('/employee-documents/{employeeDocument}', [DocumentController::class, 'destroy'])
    ->middleware(Permissions::any(Permissions::DOCUMENT_DELETE));
