<?php

use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PreferenceController;
use App\Http\Controllers\Api\V1\RbacController;
use App\Support\Permissions;
use Illuminate\Support\Facades\Route;

Route::get('/me/permissions', [RbacController::class, 'mePermissions']);

Route::get('/dashboard/statistics', [DashboardController::class, 'statistics'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/analytics/overview', [AnalyticsController::class, 'overview'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/notifications', [NotificationController::class, 'index'])
    ->middleware(Permissions::any('notification.view'));

Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead'])
    ->middleware(Permissions::any('notification.view'));

Route::post('/notifications/read', [NotificationController::class, 'markManyRead'])
    ->middleware(Permissions::any('notification.view'));

Route::get('/preferences', [PreferenceController::class, 'show']);
Route::patch('/preferences', [PreferenceController::class, 'update']);

Route::get('/audit-logs', [RbacController::class, 'auditLogs'])
    ->middleware(Permissions::any('audit.view'));
