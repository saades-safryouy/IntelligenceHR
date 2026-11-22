<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeReportingRelationship;
use App\Services\EmployeeVisibility;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrganigramController extends Controller
{
    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'rootEmployeeId' => ['nullable', 'integer', 'exists:employees,id'],
            'departmentId' => ['nullable', 'uuid', 'exists:departments,id'],
            'q' => ['nullable', 'string', 'max:100'],
            'depth' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $query = $visibility->query($request->user())
            ->with(['department', 'team', 'position', 'user'])
            ->when($filters['departmentId'] ?? null, fn ($q, $id) => $q->where('department_id', $id));

        if ($search = trim($filters['q'] ?? '')) {
            $term = mb_strtolower($search);
            $query->where(fn ($q) => $q
                ->whereRaw('LOWER(first_name) LIKE ?', ["%{$term}%"])
                ->orWhereRaw('LOWER(last_name) LIKE ?', ["%{$term}%"])
                ->orWhereRaw('LOWER(job_title) LIKE ?', ["%{$term}%"]));
        }

        $employees = $query->orderBy('last_name')->orderBy('first_name')->get();
        $ids = $employees->modelKeys();
        $today = CarbonImmutable::today();
        $relationships = EmployeeReportingRelationship::query()
            ->whereIn('employee_id', $ids)
            ->where('is_primary', true)
            ->whereDate('effective_from', '<=', $today)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $today))
            ->get(['employee_id', 'manager_employee_id'])
            ->keyBy('employee_id');
        $children = [];
        foreach ($employees as $employee) {
            $relationship = $relationships->get($employee->id);
            $managerId = $relationship && in_array($relationship->manager_employee_id, $ids, true)
                ? $relationship->manager_employee_id
                : null;
            $children[$managerId ?? 0][] = $employee;
        }

        $cycleCount = 0;
        $build = function (Employee $employee, array $visited, int $level = 1) use (&$build, &$cycleCount, $children, $filters) {
            $id = (int) $employee->id;
            if (in_array($id, $visited, true)) {
                $cycleCount++;
                return null;
            }

            $visited[] = $id;
            $node = [
                'employeeId' => $id,
                'name' => $employee->first_name.' '.$employee->last_name,
                'jobTitle' => $employee->job_title,
                'departmentId' => $employee->department_id,
                'department' => $employee->department?->name,
                'teamId' => $employee->team_id,
                'team' => $employee->team?->name,
                'positionId' => $employee->position_id,
                'position' => $employee->position?->title,
                'status' => $employee->status,
                'children' => [],
            ];

            if (($filters['depth'] ?? 20) >= $level) {
                foreach ($children[$id] ?? [] as $child) {
                    $childNode = $build($child, $visited, $level + 1);
                    if ($childNode !== null) {
                        $node['children'][] = $childNode;
                    }
                }
            }

            return $node;
        };

        if (isset($filters['rootEmployeeId'])) {
            $roots = $employees->where('id', $filters['rootEmployeeId'])->values();
            abort_if($roots->isEmpty(), 404);
        } else {
            $roots = collect($children[0] ?? []);
            if ($roots->isEmpty() && $employees->isNotEmpty()) {
                $roots = collect([$employees->first()]);
                $cycleCount++;
            }
        }

        $data = $roots->map(fn (Employee $employee) => $build($employee, []))->filter()->values();
        if (! isset($filters['rootEmployeeId']) && ! isset($filters['depth'])) {
            $renderedIds = [];
            $collectIds = function (array $nodes) use (&$collectIds, &$renderedIds): void {
                foreach ($nodes as $node) {
                    $renderedIds[$node['employeeId']] = true;
                    $collectIds($node['children']);
                }
            };
            $collectIds($data->all());

            foreach ($employees as $employee) {
                if (isset($renderedIds[$employee->id])) {
                    continue;
                }
                $orphanedComponent = $build($employee, []);
                if ($orphanedComponent !== null) {
                    $data->push($orphanedComponent);
                    $collectIds([$orphanedComponent]);
                }
            }
        }

        return response()->json([
            'data' => $data,
            'meta' => ['cycleDetected' => $cycleCount > 0],
        ]);
    }

    public function updateReporting(Request $request, Employee $employee, \App\Services\AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'managerEmployeeId' => ['present', 'nullable', 'integer', 'exists:employees,id'],
            'effectiveFrom' => ['required', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isPrimary' => ['sometimes', 'boolean'],
        ]);
        $managerId = $data['managerEmployeeId'];
        $start = CarbonImmutable::parse($data['effectiveFrom'])->startOfDay();
        $end = isset($data['effectiveTo']) ? CarbonImmutable::parse($data['effectiveTo'])->startOfDay() : null;

        if ($managerId !== null && ! Employee::query()->whereKey($managerId)->exists()) {
            throw ValidationException::withMessages(['managerEmployeeId' => ['The selected manager is not an active employee.']]);
        }

        if ($managerId !== null && (int) $managerId === (int) $employee->id) {
            throw ValidationException::withMessages([
                'managerEmployeeId' => ['An employee cannot report to themselves.'],
            ]);
        }

        $relationship = DB::transaction(function () use ($employee, $managerId, $start, $end, $data, $request, $audit) {
            Employee::query()->lockForUpdate()->orderBy('id')->get(['id']);

            if ($managerId === null) {
                $existing = EmployeeReportingRelationship::query()
                    ->where('employee_id', $employee->id)
                    ->where('is_primary', $data['isPrimary'] ?? true)
                    ->whereDate('effective_from', '<=', $start->toDateString())
                    ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $start->toDateString()))
                    ->lockForUpdate()
                    ->first();

                if ($existing) {
                    $before = $existing->only(['manager_employee_id', 'effective_from', 'effective_to']);
                    if ($existing->effective_from->equalTo($start)) {
                        $existing->delete();
                        $after = null;
                    } else {
                        $existing->update(['effective_to' => $start->subDay()->toDateString()]);
                        $after = $existing->only(['manager_employee_id', 'effective_from', 'effective_to']);
                    }
                    $audit->record($request->user(), 'employee.reporting.unassigned', $existing, changes: [
                        'before' => $before,
                        'after' => $after,
                    ]);
                } else {
                    $audit->record($request->user(), 'employee.reporting.unassigned', 'employee', $employee->id, [
                        'effective_from' => $start->toDateString(),
                    ]);
                }

                return null;
            }

            $existing = EmployeeReportingRelationship::query()
                ->where('employee_id', $employee->id)
                ->where('is_primary', $data['isPrimary'] ?? true)
                ->whereDate('effective_from', '<=', $start->toDateString())
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $start->toDateString()))
                ->lockForUpdate()
                ->first();
            if ($existing) {
                $before = $existing->only(['manager_employee_id', 'effective_from', 'effective_to']);
                if ($existing->effective_from->equalTo($start)) {
                    $existing->delete();
                    $after = null;
                } else {
                    $existing->update(['effective_to' => $start->subDay()->toDateString()]);
                    $after = $existing->only(['manager_employee_id', 'effective_from', 'effective_to']);
                }
                $audit->record($request->user(), 'employee.reporting.ended', $existing, changes: [
                    'before' => $before,
                    'after' => $after,
                ]);
            }

            $overlap = EmployeeReportingRelationship::query()
                ->where('employee_id', $employee->id)
                ->where('is_primary', $data['isPrimary'] ?? true)
                ->whereDate('effective_from', '<=', $end?->toDateString() ?? '9999-12-31')
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $start->toDateString()))
                ->exists();

            if ($overlap) {
                throw ValidationException::withMessages([
                    'effectiveFrom' => ['The reporting period overlaps an existing relationship. End the prior relationship first.'],
                ]);
            }

            if ($managerId !== null) {
                $this->assertNoCycle((int) $employee->id, (int) $managerId, $start);
            }

            $relationship = EmployeeReportingRelationship::create([
                'employee_id' => $employee->id,
                'manager_employee_id' => $managerId,
                'is_primary' => $data['isPrimary'] ?? true,
                'effective_from' => $start->toDateString(),
                'effective_to' => $end?->toDateString(),
                'created_by' => $request->user()->id,
            ]);
            $audit->record($request->user(), 'employee.reporting.assigned', $relationship, changes: [
                'employee_id' => $employee->id,
                'manager_employee_id' => $managerId,
                'effective_from' => $start->toDateString(),
                'effective_to' => $end?->toDateString(),
            ]);

            return $relationship;
        });

        return response()->json(['data' => $relationship], 201);
    }

    private function assertNoCycle(int $employeeId, int $managerId, CarbonImmutable $at): void
    {
        $visited = [];
        $cursor = $managerId;

        while ($cursor !== null) {
            if ($cursor === $employeeId || in_array($cursor, $visited, true)) {
                throw ValidationException::withMessages([
                    'managerEmployeeId' => ['The reporting relationship would create a circular hierarchy.'],
                ]);
            }

            $visited[] = $cursor;
            $cursor = EmployeeReportingRelationship::query()
                ->where('employee_id', $cursor)
                ->where('is_primary', true)
                ->whereDate('effective_from', '<=', $at->toDateString())
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $at->toDateString()))
                ->value('manager_employee_id');
            $cursor = $cursor === null ? null : (int) $cursor;
        }
    }
}
