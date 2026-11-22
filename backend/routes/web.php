<?php

use Illuminate\Support\Facades\Route;

// No web UI — the React frontend is a separate app. The API lives in routes/api.php.
Route::get('/', fn () => response()->json(['app' => 'IntelligenceHR API', 'status' => 'ok']));
