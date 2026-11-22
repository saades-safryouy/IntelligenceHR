<?php

namespace App\Http\Controllers;

use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        $request->session()->regenerate();

        return response()->json(['data' => ApiPresenter::principal(Auth::user())]);
    }

    public function me()
    {
        return response()->json(['data' => ApiPresenter::principal($this->user())]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function permissions()
    {
        return response()->json(['data' => self::permissionsFor($this->user()->roles ?? [])]);
    }
}
