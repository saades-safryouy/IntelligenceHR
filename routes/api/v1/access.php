<?php

use App\Http\Controllers\Api\V1\RbacController;
use App\Support\Permissions;
use Illuminate\Support\Facades\Route;

Route::get('/roles', [RbacController::class, 'roles'])
    ->middleware(Permissions::any('rbac.role.view'));

Route::post('/roles', [RbacController::class, 'createRole'])
    ->middleware(Permissions::any('rbac.role.create'));

Route::patch('/roles/{role}', [RbacController::class, 'updateRole'])
    ->middleware(Permissions::any('rbac.role.update'));

Route::get('/permissions', [RbacController::class, 'permissions'])
    ->middleware(Permissions::any('rbac.permission.view'));

Route::post('/permissions', [RbacController::class, 'createPermission'])
    ->middleware(Permissions::any('rbac.permission.create'));

Route::put('/roles/{role}/permissions', [RbacController::class, 'syncRolePermissions'])
    ->middleware(Permissions::any('rbac.role_permission.assign'));

Route::get('/users/{user}/roles', [RbacController::class, 'userRoles'])
    ->middleware(Permissions::any('rbac.user_role.view'));

Route::put('/users/{user}/roles', [RbacController::class, 'syncUserRoles'])
    ->middleware(Permissions::any('rbac.user_role.assign'));
