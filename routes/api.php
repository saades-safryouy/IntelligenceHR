<?php

use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    require __DIR__.'/api/v1/auth.php';

    Route::middleware('auth:sanctum')->group(function () {
        require __DIR__.'/api/v1/platform.php';
        require __DIR__.'/api/v1/people.php';
        require __DIR__.'/api/v1/access.php';
        require __DIR__.'/api/v1/workflow.php';
        require __DIR__.'/api/v1/workforce.php';
    });
});
