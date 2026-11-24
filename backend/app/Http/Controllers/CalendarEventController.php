<?php

namespace App\Http\Controllers;

use App\Models\CalendarEvent;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CalendarEventController extends Controller
{
    private const TYPES = ['Meeting', 'Company event', 'Training', 'Deadline', 'Other'];

    /**
     * GET /calendar-events — HR sees all events, everyone else only their own.
     */
    public function index()
    {
        $query = CalendarEvent::orderBy('start_date');
        if (! $this->can('people.employee.view.all')) {
            $query->where('user_id', $this->user()->id);
        }

        return response()->json(['data' => $query->get()
            ->map(fn ($e) => ApiPresenter::calendarEvent($e))->values()->all()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['nullable', 'string', Rule::in(self::TYPES)],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'note' => ['nullable', 'string'],
        ]);
        $event = CalendarEvent::create([
            'user_id' => $this->user()->id,
            'title' => $data['title'],
            'type' => $data['type'] ?? 'Company event',
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'] ?? $data['start_date'],
            'note' => $data['note'] ?? null,
        ]);
        $this->logAudit('calendar_event.created', 'calendar_event', $event->id, $event->title);

        return response()->json(['data' => ApiPresenter::calendarEvent($event)], 201);
    }

    public function update(Request $request, CalendarEvent $calendarEvent)
    {
        if (! $this->can('people.employee.view.all') && (string) $calendarEvent->user_id !== (string) $this->user()->id) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'type' => ['nullable', 'string', Rule::in(self::TYPES)],
            'start_date' => ['sometimes', 'required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'note' => ['nullable', 'string'],
        ]);
        $calendarEvent->update($data);
        $this->logAudit('calendar_event.updated', 'calendar_event', $calendarEvent->id, $calendarEvent->title);

        return response()->json(['data' => ApiPresenter::calendarEvent($calendarEvent)]);
    }

    public function destroy(CalendarEvent $calendarEvent)
    {
        if (! $this->can('people.employee.view.all') && (string) $calendarEvent->user_id !== (string) $this->user()->id) {
            return $this->forbidden();
        }
        $calendarEvent->delete();
        $this->logAudit('calendar_event.deleted', 'calendar_event', $calendarEvent->id, $calendarEvent->title);

        return response()->noContent();
    }
}
