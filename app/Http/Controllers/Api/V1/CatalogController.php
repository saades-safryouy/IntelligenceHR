<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Position;
use App\Models\Team;
use App\Services\AuditLogger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CatalogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $catalog = $request->route('catalog');
        $model = $this->model($catalog);
        $page = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'active' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'pageSize' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $model::query();
        $nameColumn = $catalog === 'positions' ? 'title' : 'name';
        if ($search = trim($page['q'] ?? '')) {
            $query->whereRaw('LOWER('.$nameColumn.') LIKE ?', ['%'.mb_strtolower($search).'%']);
        }
        if (isset($page['active'])) {
            $query->where('is_active', $page['active']);
        }

        $results = $query->orderBy($nameColumn)->paginate($page['pageSize'] ?? 25)->appends($request->query());

        return response()->json([
            'data' => $results->items(),
            'page' => $results->currentPage(),
            'pageSize' => $results->perPage(),
            'total' => $results->total(),
        ]);
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $catalog = $request->route('catalog');
        $model = $this->model($catalog);
        $data = $this->rules($request, $catalog);

        $record = DB::transaction(function () use ($model, $data, $request, $audit, $catalog) {
            $this->validateParent($catalog, $data, null);
            $record = $model::create($data);
            $audit->record($request->user(), $catalog.'.created', $record, changes: ['after' => $record->getAttributes()]);

            return $record;
        });

        return response()->json(['data' => $record], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = $this->model($request->route('catalog'))::findOrFail($id);

        return response()->json(['data' => $record]);
    }

    public function update(Request $request, string $id, AuditLogger $audit): JsonResponse
    {
        $catalog = $request->route('catalog');
        $model = $this->model($catalog);
        $record = $model::findOrFail($id);
        $data = $this->rules($request, $catalog, true, $record);

        DB::transaction(function () use ($catalog, $data, $record, $audit, $request) {
            $this->validateParent($catalog, $data, $record->getKey());
            $before = $record->getAttributes();
            $record->fill($data)->save();
            $audit->record($request->user(), $catalog.'.updated', $record, changes: [
                'before' => $this->safeAttributes($before),
                'after' => $this->safeAttributes($record->getAttributes()),
            ]);
        });

        return response()->json(['data' => $record->refresh()]);
    }

    public function destroy(Request $request, string $id, AuditLogger $audit): JsonResponse
    {
        $catalog = $request->route('catalog');
        $record = $this->model($catalog)::findOrFail($id);
        $before = $record->getAttributes();
        $record->is_active = false;
        $record->save();
        $audit->record($request->user(), $catalog.'.deactivated', $record, changes: [
            'before' => $this->safeAttributes($before),
            'after' => $this->safeAttributes($record->getAttributes()),
        ]);

        return response()->json([], 204);
    }

    private function model(string $catalog): string
    {
        return match ($catalog) {
            'departments' => Department::class,
            'teams' => Team::class,
            'positions' => Position::class,
            default => abort(404),
        };
    }

    private function rules(Request $request, string $catalog, bool $partial = false, ?Model $record = null): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $codeUnique = Rule::unique($record?->getTable() ?? $this->model($catalog)::make()->getTable(), 'code')
            ->ignore($record?->getKey());

        return $request->validate(match ($catalog) {
            'departments' => [
                'code' => [$required, 'string', 'max:50', $codeUnique],
                'name' => [$required, 'string', 'max:150'],
                'parent_department_id' => ['sometimes', 'nullable', 'uuid', 'exists:departments,id'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'teams' => [
                'department_id' => [$required, 'uuid', 'exists:departments,id'],
                'code' => [$required, 'string', 'max:50', $codeUnique],
                'name' => [$required, 'string', 'max:150'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'positions' => [
                'department_id' => ['sometimes', 'nullable', 'uuid', 'exists:departments,id'],
                'code' => [$required, 'string', 'max:50', $codeUnique],
                'title' => [$required, 'string', 'max:150'],
                'reports_to_position_id' => ['sometimes', 'nullable', 'uuid', 'exists:positions,id'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            default => [],
        });
    }

    private function validateParent(string $catalog, array $data, string|int|null $recordId): void
    {
        if ($catalog === 'departments' && isset($data['parent_department_id']) && $data['parent_department_id'] !== null) {
            $parent = Department::findOrFail($data['parent_department_id']);
            if ((string) $parent->id === (string) $recordId) {
                throw ValidationException::withMessages(['parent_department_id' => ['A department cannot be its own parent.']]);
            }
            $cursor = $parent;
            $visited = [];
            while ($cursor) {
                if (in_array((string) $cursor->id, $visited, true) || (string) $cursor->id === (string) $recordId) {
                    throw ValidationException::withMessages(['parent_department_id' => ['The department hierarchy cannot contain a cycle.']]);
                }
                $visited[] = (string) $cursor->id;
                $cursor = $cursor->parent;
            }
        }

        if ($catalog === 'positions' && isset($data['reports_to_position_id']) && $data['reports_to_position_id'] !== null) {
            $cursor = Position::findOrFail($data['reports_to_position_id']);
            $visited = [];
            while ($cursor) {
                if (in_array((string) $cursor->id, $visited, true) || (string) $cursor->id === (string) $recordId) {
                    throw ValidationException::withMessages(['reports_to_position_id' => ['The position hierarchy cannot contain a cycle.']]);
                }
                $visited[] = (string) $cursor->id;
                $cursor = $cursor->reportsTo;
            }
        }
    }

    private function safeAttributes(array $attributes): array
    {
        unset($attributes['created_at'], $attributes['updated_at']);

        return $attributes;
    }
}
