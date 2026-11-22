<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;

class HolidayController extends Controller
{
    public function index(Request $request)
    {
        $query = Holiday::orderBy('date');
        if ($year = $request->query('year')) {
            $query->whereYear('date', $year);
        }

        return response()->json(['data' => $query->get()
            ->map(fn ($h) => ApiPresenter::holiday($h))->values()->all()]);
    }

    public function store(Request $request)
    {
        if (! $this->can('people.employee.create')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'name_key' => ['nullable', 'string', 'max:255'],
            'date' => ['required', 'date'],
            'days' => ['nullable', 'integer', 'min:1'],
            'recurring' => ['nullable', 'boolean'],
            'type' => ['nullable', 'string', 'in:Public,Company'],
            'country' => ['nullable', 'string', 'size:2'],
            'site' => ['nullable', 'string', 'max:255'],
        ]);
        $holiday = Holiday::create($data);

        return response()->json(['data' => ApiPresenter::holiday($holiday)], 201);
    }

    public function update(Request $request, Holiday $holiday)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'name_key' => ['nullable', 'string', 'max:255'],
            'date' => ['sometimes', 'required', 'date'],
            'days' => ['nullable', 'integer', 'min:1'],
            'recurring' => ['nullable', 'boolean'],
            'type' => ['nullable', 'string', 'in:Public,Company'],
            'country' => ['nullable', 'string', 'size:2'],
            'site' => ['nullable', 'string', 'max:255'],
        ]);
        $holiday->update($data);

        return response()->json(['data' => ApiPresenter::holiday($holiday)]);
    }

    public function destroy(Holiday $holiday)
    {
        if (! $this->can('people.employee.update')) {
            return $this->forbidden();
        }
        $holiday->delete();

        return response()->noContent();
    }
}
