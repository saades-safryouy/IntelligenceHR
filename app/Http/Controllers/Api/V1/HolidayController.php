<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Holiday;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HolidayController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'year' => ['sometimes', 'integer', 'min:2000', 'max:2200'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2'],
        ]);
        $year = $filters['year'] ?? now()->year;
        $country = $filters['country'] ?? null;

        $query = Holiday::query()
            ->where(fn ($q) => $q->whereYear('date', $year)->orWhere('recurring', true))
            ->when($country, fn ($q) => $q->where(fn ($scope) => $scope
                ->where('country', $country)
                ->orWhereNull('country')))
            ->orderBy('date');

        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'name_key' => ['nullable', 'string', 'max:100'],
            'date' => ['required', 'date'],
            'days' => ['sometimes', 'integer', 'min:1'],
            'recurring' => ['sometimes', 'boolean'],
            'type' => ['sometimes', 'string', 'in:Public,Company'],
            'country' => ['nullable', 'string', 'size:2'],
            'site' => ['nullable', 'string', 'max:100'],
        ]);

        $holiday = Holiday::create($data);
        $audit->record($request->user(), 'holiday.created', $holiday);

        return response()->json(['data' => $holiday], 201);
    }
}
