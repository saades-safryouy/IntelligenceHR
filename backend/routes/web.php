<?php

use Illuminate\Support\Facades\Route;

// No web UI — the React frontend is a separate app. The API lives in routes/api.php.
Route::get('/', fn () => response()->json(['app' => 'IntelligenceHR API', 'status' => 'ok']));

// Named 'login' route so the auth middleware's redirectTo() can resolve it
// for non-JSON requests; the API exception handler still returns 401 JSON.
Route::get('/login', function () {
    return response()->json(['message' => 'Unauthenticated.'], 401);
})->name('login');
