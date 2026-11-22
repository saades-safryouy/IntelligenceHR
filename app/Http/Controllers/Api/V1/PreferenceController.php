<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\UserPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $pref = UserPreference::firstOrCreate(
            ['user_id' => $request->user()->id],
            ['theme' => 'dark', 'language' => 'en']
        );
        return response()->json(['data' => $pref]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme' => ['sometimes', 'string', 'in:dark,light'],
            'language' => ['sometimes', 'string', 'in:en,fr,ar'],
            'settings' => ['sometimes', 'nullable', 'array'],
        ]);

        $pref = UserPreference::updateOrCreate(
            ['user_id' => $request->user()->id],
            $data
        );

        return response()->json(['data' => $pref]);
    }
}
