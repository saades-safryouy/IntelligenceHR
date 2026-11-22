<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));
        $query = Notification::where('user_id', $this->user()->id)->orderByDesc('created_at');
        if ($request->query('unread')) {
            $query->unread();
        }
        $total = $query->count();
        $items = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::page(
            $items->map(fn ($n) => ApiPresenter::notification($n))->values()->all(),
            $page, $pageSize, $total
        ));
    }

    public function read(Notification $notification)
    {
        if ((string) $notification->user_id !== (string) $this->user()->id && ! $this->can('people.employee.view.all')) {
            return $this->forbidden();
        }
        $notification->update(['read_at' => now()]);

        return response()->json(['data' => ApiPresenter::notification($notification)]);
    }

    /** POST /notifications/read — accepts {notificationIds: [...]} or no body (mark all mine read). */
    public function readMany(Request $request)
    {
        $ids = $request->input('notificationIds');
        $query = Notification::where('user_id', $this->user()->id)->unread();
        if (is_array($ids) && $ids) {
            $query->whereIn('id', $ids);
        }
        $query->update(['read_at' => now()]);

        return response()->json(['data' => ['marked' => true]]);
    }
}
