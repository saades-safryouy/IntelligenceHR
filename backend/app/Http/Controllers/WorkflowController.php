<?php

namespace App\Http\Controllers;

use App\Models\LeaveRequest;
use App\Models\OffboardingCase;
use App\Models\OnboardingCase;
use App\Models\WorkflowAction;
use App\Models\WorkflowDelegation;
use App\Models\WorkflowInstance;
use App\Models\WorkflowTemplate;
use App\Models\WorkflowTemplateVersion;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WorkflowController extends Controller
{
    // --- Instances ---
    public function indexInstances(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));
        $query = WorkflowInstance::with(['initiator', 'actions.actor'])->orderByDesc('submitted_at');

        if (! $this->can('workflow.instance.view.all')) {
            $me = (string) $this->user()->id;
            $query->where(function ($q) use ($me, $request) {
                $q->where('initiator_user_id', $me);
                if ($request->query('assignedToMe')) {
                    // Assignments live in the steps JSON; match the approver id inside it.
                    $q->orWhere('steps', 'like', '%"approver_user_id":"'.$me.'"%');
                }
            });
        }
        if ($request->query('mine')) {
            $query->where('initiator_user_id', (string) $this->user()->id);
        }
        if ($type = $request->query('resourceType')) {
            $query->where('resource_type', $type);
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($from = $request->query('submittedFrom')) {
            $query->where('submitted_at', '>=', $from);
        }
        if ($to = $request->query('submittedTo')) {
            $query->where('submitted_at', '<=', $to);
        }
        if ($module = $request->query('module')) {
            $ids = WorkflowTemplate::where('module', $module)->pluck('resource_type')->all();
            $query->whereIn('resource_type', $ids);
        }

        $total = $query->count();
        $items = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::page(
            $items->map(fn ($i) => ApiPresenter::workflowInstance($i))->values()->all(),
            $page, $pageSize, $total
        ));
    }

    public function showInstance(WorkflowInstance $workflowInstance)
    {
        $workflowInstance->load(['initiator', 'actions.actor']);

        return response()->json(['data' => ApiPresenter::workflowInstance($workflowInstance)]);
    }

    public function resource(WorkflowInstance $workflowInstance)
    {
        $resource = $workflowInstance->resource();
        if (! $resource) {
            return response()->json(['data' => null]);
        }
        $data = match ($workflowInstance->resource_type) {
            'leave_request' => ApiPresenter::leaveRequest($resource),
            'onboarding_case' => ApiPresenter::onboardingCase($resource->load('tasks')),
            'offboarding_case' => ApiPresenter::offboardingCase($resource),
            default => $resource->toArray(),
        };

        return response()->json(['data' => $data]);
    }

    public function history(Request $request, WorkflowInstance $workflowInstance)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));
        $query = WorkflowAction::with('actor')->where('workflow_instance_id', $workflowInstance->id)->orderByDesc('occurred_at');
        $total = $query->count();
        $events = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get()->map(fn ($a) => [
            'id' => (string) $a->id,
            'event_type' => $a->action,
            'from_status' => null,
            'to_status' => null,
            'data' => ['comment' => $a->comment, 'assignment_id' => $a->assignment_id],
            'occurred_at' => $a->occurred_at?->toISOString(),
            'actor' => $a->actor ? ['id' => (string) $a->actor->id, 'name' => $a->actor->name] : null,
        ])->values()->all();

        return response()->json(ApiPresenter::page($events, $page, $pageSize, $total));
    }

    /**
     * POST /workflow-instances/{id}/actions — the ONLY way to decide a
     * leave / onboarding / offboarding request (contract §3.2, §3.7).
     * Body uses camelCase keys exactly as the frontend sends them.
     */
    public function action(Request $request, WorkflowInstance $workflowInstance)
    {
        if (! $this->can('workflow.approve')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'assignmentId' => ['required', 'string'],
            'action' => ['required', 'string', 'in:approve,reject,return'],
            'comment' => ['nullable', 'string'],
            'idempotencyKey' => ['nullable', 'string'],
        ]);

        // Idempotency: same actor + assignment + action already recorded.
        $existing = WorkflowAction::where('workflow_instance_id', $workflowInstance->id)
            ->where('assignment_id', $data['assignmentId'])
            ->where('actor_user_id', $this->user()->id)
            ->where('action', $data['action'])
            ->first();
        if ($existing) {
            $workflowInstance->load(['initiator', 'actions.actor']);

            return response()->json(['data' => ApiPresenter::workflowInstance($workflowInstance)]);
        }

        $steps = $workflowInstance->steps ?? [];
        $found = false;
        foreach ($steps as &$step) {
            foreach ($step['assignments'] ?? [] as &$assignment) {
                if (($assignment['id'] ?? null) === $data['assignmentId']) {
                    $found = true;
                    $assignment['status'] = $data['action'] === 'approve' ? 'approved' : $data['action'];
                    $assignment['resolved_at'] = now()->toISOString();
                }
            }
            unset($assignment);
        }
        unset($step);
        if (! $found) {
            return response()->json(['message' => 'Assignment not found on this instance.', 'errors' => ['assignmentId' => ['Assignment not found on this instance.']]], 422);
        }

        WorkflowAction::create([
            'workflow_instance_id' => $workflowInstance->id,
            'assignment_id' => $data['assignmentId'],
            'action' => $data['action'],
            'comment' => $data['comment'] ?? null,
            'actor_user_id' => $this->user()->id,
            'occurred_at' => now(),
        ]);

        // Advance the workflow: approve completes the current step when all
        // its assignments are resolved; reject/return closes the instance.
        $current = $steps[$workflowInstance->current_step] ?? null;
        $stepDone = $current && collect($current['assignments'] ?? [])->every(fn ($a) => in_array($a['status'] ?? '', ['approved', 'rejected', 'returned'], true));
        if ($data['action'] === 'reject' || $data['action'] === 'return') {
            $workflowInstance->status = $data['action'] === 'reject' ? 'rejected' : 'returned';
            $workflowInstance->completed_at = now();
            $this->applyDecision($workflowInstance, $data['action']);
        } elseif ($stepDone) {
            if ($workflowInstance->current_step + 1 < count($steps)) {
                $workflowInstance->current_step++;
                $steps[$workflowInstance->current_step]['status'] = 'active';
                foreach ($steps[$workflowInstance->current_step]['assignments'] ?? [] as &$a) {
                    $a['status'] = 'active';
                    $a['activated_at'] = now()->toISOString();
                }
                unset($a);
            } else {
                $workflowInstance->status = 'approved';
                $workflowInstance->completed_at = now();
                $this->applyDecision($workflowInstance, 'approve');
            }
        }
        $workflowInstance->steps = $steps;
        $workflowInstance->save();
        $workflowInstance->load(['initiator', 'actions.actor']);

        return response()->json(['data' => ApiPresenter::workflowInstance($workflowInstance)]);
    }

    /** Reflect a final workflow decision on the owning resource. */
    private function applyDecision(WorkflowInstance $instance, string $action): void
    {
        $resource = $instance->resource();
        if (! $resource) {
            return;
        }
        if ($instance->resource_type === 'leave_request') {
            $resource->update(['status' => $action === 'approve' ? 'approved' : 'rejected']);
        } elseif (in_array($instance->resource_type, ['onboarding_case', 'offboarding_case'], true)) {
            $resource->update(['approval_status' => $action === 'approve' ? 'approved' : 'rejected']);
        }
    }

    // --- Templates ---
    public function indexTemplates(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));
        $query = WorkflowTemplate::with('versions')->orderBy('name');
        $total = $query->count();
        $items = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::page(
            $items->map(fn ($t) => ApiPresenter::workflowTemplate($t))->values()->all(),
            $page, $pageSize, $total
        ));
    }

    public function storeTemplate(Request $request)
    {
        if (! $this->can('workflow.instance.view.all')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'key' => ['required', 'string', 'max:100', 'unique:workflow_templates,key'],
            'module' => ['required', 'string', 'max:100'],
            'resourceType' => ['required', 'string', 'max:100'],
            'name' => ['required', 'string', 'max:255'],
        ]);
        $template = WorkflowTemplate::create([
            'key' => $data['key'],
            'module' => $data['module'],
            'resource_type' => $data['resourceType'],
            'name' => $data['name'],
            'is_active' => true,
        ]);
        $template->load('versions');

        return response()->json(['data' => ApiPresenter::workflowTemplate($template)], 201);
    }

    public function storeVersion(Request $request, WorkflowTemplate $workflowTemplate)
    {
        if (! $this->can('workflow.instance.view.all')) {
            return $this->forbidden();
        }
        $data = $request->validate(['steps' => ['required', 'array']]);
        $version = WorkflowTemplateVersion::create([
            'workflow_template_id' => $workflowTemplate->id,
            'version_number' => ($workflowTemplate->versions()->max('version_number') ?? 0) + 1,
            'status' => 'draft',
            'steps' => $data['steps'],
        ]);

        return response()->json(['data' => [
            'id' => (string) $version->id,
            'version_number' => $version->version_number,
            'status' => $version->status,
            'published_at' => null,
        ]], 201);
    }

    public function publishVersion(WorkflowTemplateVersion $version)
    {
        if (! $this->can('workflow.instance.view.all')) {
            return $this->forbidden();
        }
        WorkflowTemplateVersion::where('workflow_template_id', $version->workflow_template_id)
            ->where('status', 'published')->update(['status' => 'draft', 'published_at' => null]);
        $version->update(['status' => 'published', 'published_at' => now()]);

        return response()->json(['data' => [
            'id' => (string) $version->id,
            'version_number' => $version->version_number,
            'status' => $version->status,
            'published_at' => $version->published_at?->toISOString(),
        ]]);
    }

    // --- Delegations ---
    public function indexDelegations(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 25)));
        $query = WorkflowDelegation::with(['delegator', 'delegate'])->orderByDesc('created_at');
        if (! $this->can('workflow.instance.view.all')) {
            $query->where('delegator_user_id', (string) $this->user()->id);
        }
        $total = $query->count();
        $items = $query->skip(($page - 1) * $pageSize)->take($pageSize)->get();

        return response()->json(ApiPresenter::page(
            $items->map(fn ($d) => ApiPresenter::delegation($d))->values()->all(),
            $page, $pageSize, $total
        ));
    }

    public function storeDelegation(Request $request)
    {
        $data = $request->validate([
            'assignmentId' => ['required', 'string'],
            'delegateUserId' => ['required', 'string', 'exists:users,id'],
            'startsAt' => ['nullable', 'date'],
            'endsAt' => ['nullable', 'date'],
        ]);
        $delegation = WorkflowDelegation::create([
            'delegator_user_id' => $this->user()->id,
            'delegate_user_id' => $data['delegateUserId'],
            'approval_assignment_id' => $data['assignmentId'],
            'starts_at' => $data['startsAt'] ?? null,
            'ends_at' => $data['endsAt'] ?? null,
        ]);
        $delegation->load(['delegator', 'delegate']);

        return response()->json(['data' => ApiPresenter::delegation($delegation)], 201);
    }

    public function destroyDelegation(WorkflowDelegation $workflowDelegation)
    {
        $out = ApiPresenter::delegation($workflowDelegation);
        $workflowDelegation->delete();

        return response()->json(['data' => $out]);
    }
}
