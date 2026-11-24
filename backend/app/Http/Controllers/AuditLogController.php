<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * GET /audit-logs — bare paginated page, newest first. HR only.
     * Optional filters: ?action=employee.created&user=<name or user id>.
     */
    public function index(Request $request)
    {
        if (! $this->can('people.employee.view.all')) {
            return $this->forbidden();
        }
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));

        $query = AuditLog::orderByDesc('created_at');
        if ($action = $request->query('action')) {
            $query->where('action', $action);
        }
        if ($user = $request->query('user')) {
            $query->where(function ($q) use ($user) {
                $q->where('user_name', 'like', "%{$user}%")->orWhere('user_id', $user);
            });
        }

        $total = $query->count();
        $items = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::paginatedPage(
            $items->map(fn ($l) => ApiPresenter::auditLog($l))->values()->all(),
            $page, $pageSize, $total
        ));
    }
}
