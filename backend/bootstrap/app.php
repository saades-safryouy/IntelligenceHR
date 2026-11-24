<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Sanctum stateful SPA auth for the /api routes (cookie session).
        // statefulApi() prepends EnsureFrontendRequestsAreStateful.
        $middleware->statefulApi();
        // Tenant resolution (Payroll P1, BRD §2.2): the middleware runs
        // after auth:sanctum on the authenticated route group.
        $middleware->alias(['tenant' => \App\Http\Middleware\ResolveTenant::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Unauthenticated API requests must get a 401 JSON response, not a
        // redirect to a 'login' route (which does not exist for this API).
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })->create();
