<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EmployeeNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'unread' => ['nullable', 'boolean'],
            'type' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $query = EmployeeNotification::query()
            ->where('recipient_user_id', $request->user()->id)
            ->when(($filters['unread'] ?? false), fn ($q) => $q->whereNull('read_at'))
            ->when($filters['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->orderByDesc('created_at');
        $result = $query->paginate($filters['pageSize'] ?? 25)->appends($request->query());

        return response()->json([
            'data' => $result->items(),
            'page' => $result->currentPage(),
            'pageSize' => $result->perPage(),
            'total' => $result->total(),
        ]);
    }

    public function markRead(Request $request, EmployeeNotification $notification): JsonResponse
    {
        abort_unless($notification->recipient_user_id === $request->user()->id, 404);
        $notification->update(['read_at' => $notification->read_at ?? now()]);

        return response()->json(['data' => $notification->refresh()]);
    }

    public function markManyRead(Request $request): JsonResponse
    {
        $data = $request->validate([
            'notificationIds' => ['required', 'array', 'min:1', 'max:100'],
            'notificationIds.*' => ['required', 'uuid', 'distinct'],
        ]);
        $updated = EmployeeNotification::query()
            ->where('recipient_user_id', $request->user()->id)
            ->whereIn('id', $data['notificationIds'])
            ->whereNull('read_at')
            ->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json(['data' => ['updated' => $updated]]);
    }
}
