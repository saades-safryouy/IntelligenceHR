<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
        ]);

        if (! Auth::attempt([...$credentials, 'is_active' => true])) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are invalid.'],
            ]);
        }

        $request->session()->regenerate();

        return response()->json(['data' => $this->principal($request)], 200);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        Auth::forgetGuards();

        return response()->json([], 204);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->principal($request)]);
    }

    private function principal(Request $request): array
    {
        $user = $request->user()->loadMissing(['employee.department', 'employee.position']);
        $roles = $user->activeRoles()->with('permissions')->get();

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'employeeId' => $user->employee_id,
                'isActive' => $user->is_active,
            ],
            'employee' => $user->employee ? [
                'id' => $user->employee->id,
                'departmentId' => $user->employee->department_id,
                'positionId' => $user->employee->position_id,
                'status' => $user->employee->status,
            ] : null,
            'roles' => $roles->pluck('key')->values(),
            'permissions' => $roles->flatMap(
                fn ($role) => $role->permissions->pluck('key'),
            )->unique()->values(),
        ];
    }
}
