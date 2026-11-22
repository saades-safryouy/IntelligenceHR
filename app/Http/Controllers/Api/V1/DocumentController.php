<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\EmployeeNotification;
use App\Models\WorkflowTemplate;
use App\Services\AuditLogger;
use App\Services\EmployeeVisibility;
use App\Services\WorkflowEngine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class DocumentController extends Controller
{
    public function index(Request $request, EmployeeVisibility $visibility): JsonResponse
    {
        $filters = $request->validate([
            'employeeId' => ['nullable', 'integer', 'exists:employees,id'],
            'category' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['missing', 'pending', 'under_review', 'approved', 'rejected', 'expired', 'archived'])],
            'search' => ['nullable', 'string', 'max:100'],
            'expiresBefore' => ['nullable', 'date'],
            'expiresAfter' => ['nullable', 'date'],
            'hasExpiry' => ['nullable', 'boolean'],
        ]);
        $query = EmployeeDocument::with(['employee', 'workflowInstances'])
            ->whereIn('employee_id', $visibility->query($request->user())->select('id'))
            ->when($filters['employeeId'] ?? null, fn (Builder $builder, $id) => $builder->where('employee_id', $id))
            ->when($filters['category'] ?? null, fn (Builder $builder, $category) => $builder->where('type', $category))
            ->when($filters['search'] ?? null, function (Builder $builder, $search): void {
                $builder->where(function (Builder $matches) use ($search): void {
                    $matches->where('name', 'like', '%'.$search.'%')
                        ->orWhere('type', 'like', '%'.$search.'%')
                        ->orWhereHas('employee', fn (Builder $employee) => $employee
                            ->where('first_name', 'like', '%'.$search.'%')
                            ->orWhere('last_name', 'like', '%'.$search.'%'));
                });
            })
            ->when($filters['expiresBefore'] ?? null, fn (Builder $builder, $date) => $builder->whereDate('expiry_date', '<=', $date))
            ->when($filters['expiresAfter'] ?? null, fn (Builder $builder, $date) => $builder->whereDate('expiry_date', '>=', $date))
            ->when(array_key_exists('hasExpiry', $filters), fn (Builder $builder) => filter_var($filters['hasExpiry'], FILTER_VALIDATE_BOOLEAN)
                ? $builder->whereNotNull('expiry_date')
                : $builder->whereNull('expiry_date'))
            ->when($filters['status'] ?? null, fn (Builder $builder, $status) => $this->filterStatus($builder, $status))
            ->orderByDesc('uploaded_at');

        return response()->json(['data' => $query->get()->map(fn (EmployeeDocument $document) => $this->serialize($document))]);
    }

    public function show(Request $request, EmployeeDocument $employeeDocument, EmployeeVisibility $visibility): JsonResponse
    {
        $document = $employeeDocument->load('employee');
        abort_unless($visibility->canSee($request->user(), $document->employee), 404);

        return response()->json(['data' => $this->serialize($document)]);
    }

    public function store(Request $request, AuditLogger $audit, EmployeeVisibility $visibility, WorkflowEngine $workflow): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['identity', 'employment', 'certificates', 'contracts', 'administrative', 'other'])],
            'issue_date' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,docx', 'extensions:pdf,jpg,jpeg,png,docx', 'max:'.config('documents.max_upload_kb')],
        ]);
        if (isset($data['issue_date'], $data['expiry_date'])) {
            abort_if($data['expiry_date'] < $data['issue_date'], 422, 'Expiry date cannot be before issue date.');
        }
        $employee = Employee::findOrFail($data['employee_id']);
        abort_unless($visibility->canSee($request->user(), $employee), 404);
        abort_if((int) $request->user()->employee_id === (int) $employee->id, 403, 'Submit documents requested by HR using the assigned document record.');
        $file = $request->file('file');
        $path = $file ? $this->storeFile($file, (string) Str::uuid()) : null;

        try {
            $document = DB::transaction(function () use ($data, $employee, $file, $path, $request, $audit, $workflow): EmployeeDocument {
                $document = EmployeeDocument::create([
                    'employee_id' => $employee->id,
                    'name' => $data['name'],
                    'type' => $data['type'],
                    'uploaded_at' => now()->toDateString(),
                    'issue_date' => $data['issue_date'] ?? null,
                    'expiry_date' => $data['expiry_date'] ?? null,
                    'status' => $file ? 'under_review' : 'missing',
                    'file_path' => $path,
                    'storage_disk' => $path ? config('documents.disk') : null,
                    'mime_type' => $file?->getMimeType(),
                    'file_size' => $file?->getSize(),
                ]);
                if (! $file) {
                    $this->notifyEmployee($employee, $document, 'document.requested', 'Document requested', 'Please submit: '.$document->name, 'requested');
                } else {
                    $workflowStarted = $this->startDocumentWorkflowIfConfigured($request, $document, $audit, $workflow);
                    if (! $workflowStarted) {
                        $this->notifyReviewers($document, $request->user()->name.' submitted '.$document->name);
                    }
                }
                $audit->record($request->user(), $file ? 'document.uploaded' : 'document.requested', $document);

                return $document;
            });
        } catch (Throwable $exception) {
            if ($path) {
                Storage::disk(config('documents.disk'))->delete($path);
            }
            throw $exception;
        }

        return response()->json(['data' => $this->serialize($document->load('employee'))], 201);
    }

    public function upload(Request $request, EmployeeDocument $employeeDocument, AuditLogger $audit, EmployeeVisibility $visibility, WorkflowEngine $workflow): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,docx', 'extensions:pdf,jpg,jpeg,png,docx', 'max:'.config('documents.max_upload_kb')],
        ]);
        $document = $employeeDocument->load('employee');
        abort_unless($visibility->canSee($request->user(), $document->employee), 404);
        $isEmployeeOwner = (int) $request->user()->employee_id === (int) $document->employee_id;
        if ($isEmployeeOwner) {
            abort_unless(in_array($document->status, ['missing', 'rejected'], true), 403);
        } else {
            abort_unless($request->user()->hasPermission('people.employee.update'), 403);
        }

        $file = $data['file'];
        abort_if($this->isArchived($document), 422, 'Archived documents cannot be replaced.');
        $path = $this->storeFile($file, (string) $document->id);
        $oldPath = $document->file_path;
        $oldDisk = $document->storage_disk;

        try {
            DB::transaction(function () use ($document, $file, $path, $isEmployeeOwner, $request, $audit, $workflow): void {
                $document->update([
                    'file_path' => $path,
                    'storage_disk' => config('documents.disk'),
                    'mime_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                    'uploaded_at' => now()->toDateString(),
                    'status' => 'pending',
                    'review_comment' => null,
                    'reviewed_by_user_id' => null,
                    'reviewed_at' => null,
                    'archived_at' => null,
                ]);
                $workflowStarted = $this->startDocumentWorkflowIfConfigured($request, $document, $audit, $workflow);
                if ($isEmployeeOwner && ! $workflowStarted) {
                    $this->notifyReviewers($document, $request->user()->name.' submitted '.$document->name);
                }
                $audit->record($request->user(), 'document.replaced', $document);
            });
        } catch (Throwable $exception) {
            Storage::disk(config('documents.disk'))->delete($path);
            throw $exception;
        }

        if ($oldPath && $oldPath !== $path && $this->isManagedPath($oldPath, (string) $document->id)) {
            if (! Storage::disk($oldDisk ?: config('documents.disk'))->delete($oldPath)) {
                Log::error('Unable to remove the replaced employee document file.', ['document_id' => $document->id]);
            }
        }

        return response()->json(['data' => $this->serialize($document->refresh()->load('employee'))]);
    }

    public function update(Request $request, EmployeeDocument $employeeDocument, AuditLogger $audit, EmployeeVisibility $visibility): JsonResponse
    {
        $document = $employeeDocument->load('employee');
        abort_unless($visibility->canSee($request->user(), $document->employee), 404);
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'type' => ['sometimes', 'required', Rule::in(['identity', 'employment', 'certificates', 'contracts', 'administrative', 'other'])],
            'issue_date' => ['sometimes', 'nullable', 'date'],
            'expiry_date' => ['sometimes', 'nullable', 'date'],
        ]);
        if (isset($data['issue_date'], $data['expiry_date'])) {
            abort_if($data['expiry_date'] < $data['issue_date'], 422, 'Expiry date cannot be before issue date.');
        }

        DB::transaction(function () use ($document, $data, $audit, $request): void {
            $document->update($data);
            $audit->record($request->user(), 'document.updated', $document);
        });

        return response()->json(['data' => $this->serialize($document->refresh()->load('employee'))]);
    }

    public function download(Request $request, EmployeeDocument $employeeDocument, EmployeeVisibility $visibility): StreamedResponse
    {
        $document = $employeeDocument;
        abort_unless($visibility->canSee($request->user(), $document->employee), 404);
        abort_unless($document->file_path && $document->storage_disk && $this->isManagedPath($document->file_path, (string) $document->id), 404);
        abort_if((config('filesystems.disks.'.$document->storage_disk.'.visibility') ?? 'private') === 'public', 404);
        $disk = Storage::disk($document->storage_disk);
        abort_unless($disk->exists($document->file_path), 404);
        abort_if($this->isArchived($document), 403);

        app(AuditLogger::class)->record($request->user(), 'document.downloaded', $document);
        $filename = preg_replace('/[\x00-\x1F\x7F\/\\\\]+/', '_', $document->name) ?: 'document';
        $extension = pathinfo($document->file_path, PATHINFO_EXTENSION);
        if ($extension && ! Str::endsWith($filename, '.'.$extension)) {
            $filename .= '.'.$extension;
        }
        $filename = Str::limit($filename, 180, '');
        $inline = $request->boolean('inline') && in_array($document->mime_type, ['application/pdf', 'image/jpeg', 'image/png'], true);

        return $disk->response(
            $document->file_path,
            $filename ?: 'document',
            [
                'Content-Type' => $document->mime_type ?: 'application/octet-stream',
                'X-Content-Type-Options' => 'nosniff',
                'Cache-Control' => 'private, no-store',
            ],
            $inline ? 'inline' : 'attachment',
        );
    }

    public function review(Request $request, EmployeeDocument $employeeDocument, AuditLogger $audit, EmployeeVisibility $visibility): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected'])],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);
        $document = $employeeDocument->load('employee');
        abort_unless($visibility->canSee($request->user(), $document->employee), 404);
        abort_if(
            $document->workflowInstances()->where('status', 'pending_approval')->exists(),
            409,
            'This document is being reviewed through its assigned workflow.',
        );
        abort_unless(in_array($document->status, ['pending', 'under_review'], true), 422, 'Only submitted documents can be reviewed.');
        abort_unless($document->file_path, 422, 'A document file is required before review.');

        DB::transaction(function () use ($document, $data, $request, $audit): void {
            $document->update([
                'status' => $data['status'],
                'review_comment' => $data['comment'] ?? null,
                'reviewed_by_user_id' => $request->user()->id,
                'reviewed_at' => now(),
            ]);
            $this->notifyEmployee(
                $document->employee,
                $document,
                'document.'.$data['status'],
                $data['status'] === 'approved' ? 'Document approved' : 'Replacement required',
                $data['status'] === 'approved'
                    ? 'Your document was approved: '.$document->name
                    : 'Your document needs a replacement: '.$document->name.($data['comment'] ? ' — '.$data['comment'] : ''),
                $data['status'],
            );
            $audit->record($request->user(), 'document.'.$data['status'], $document);
        });

        return response()->json(['data' => $this->serialize($document->refresh()->load('employee'))]);
    }

    public function archive(Request $request, EmployeeDocument $employeeDocument, AuditLogger $audit, EmployeeVisibility $visibility): JsonResponse
    {
        abort_unless($visibility->canSee($request->user(), $employeeDocument->employee), 404);
        abort_unless(! $this->isArchived($employeeDocument), 422, 'Document is already archived.');
        DB::transaction(function () use ($employeeDocument, $audit, $request): void {
            $employeeDocument->update(['status' => 'archived', 'archived_at' => now()]);
            $audit->record($request->user(), 'document.archived', $employeeDocument);
        });

        return response()->json(['data' => $this->serialize($employeeDocument->refresh()->load('employee'))]);
    }

    public function destroy(Request $request, EmployeeDocument $employeeDocument, AuditLogger $audit, EmployeeVisibility $visibility): JsonResponse
    {
        abort_unless($visibility->canSee($request->user(), $employeeDocument->employee), 404);
        $document = $employeeDocument;
        $path = $document->file_path;
        $disk = $document->storage_disk ?: config('documents.disk');
        $storage = Storage::disk($disk);
        $managedPath = $path && $this->isManagedPath($path, (string) $document->id) && $storage->exists($path);
        $backupPath = $managedPath ? 'employee-documents/'.$document->id.'/.deleting-'.Str::uuid() : null;
        if ($managedPath && (! $storage->copy($path, $backupPath) || ! $storage->delete($path))) {
            $storage->delete($backupPath);
            throw new RuntimeException('The document file could not be prepared for deletion.');
        }

        try {
            DB::transaction(function () use ($document, $audit, $request): void {
                $audit->record($request->user(), 'document.deleted', $document);
                $document->delete();
            });
        } catch (Throwable $exception) {
            if ($managedPath && (! $storage->copy($backupPath, $path) || ! $storage->delete($backupPath))) {
                Log::critical('Failed to restore employee document after database deletion failure.', ['document_id' => $document->id]);
            }
            throw $exception;
        }

        if ($backupPath && ! $storage->delete($backupPath)) {
            Log::error('Unable to remove the temporary employee document deletion copy.', ['document_id' => $document->id]);
        }

        return response()->json(['message' => 'Document deleted successfully']);
    }

    private function filterStatus(Builder $query, string $status): Builder
    {
        if ($status === 'expired') {
            return $query->where(function (Builder $matches): void {
                $matches->where('status', 'expired')
                    ->orWhere(fn (Builder $approved) => $approved->where('status', 'approved')->whereDate('expiry_date', '<', today()));
            });
        }

        if ($status === 'approved') {
            return $query->where('status', 'approved')->where(fn (Builder $current) => $current
                ->whereNull('expiry_date')->orWhereDate('expiry_date', '>=', today()));
        }

        return $query->where('status', $status);
    }

    private function storeFile(UploadedFile $file, string $documentId): string
    {
        $diskName = config('documents.disk');
        $diskConfig = config('filesystems.disks.'.$diskName, []);
        if (($diskConfig['visibility'] ?? 'private') === 'public') {
            throw new RuntimeException('Document storage must use a private filesystem disk.');
        }

        $extension = strtolower($file->getClientOriginalExtension());
        abort_unless(in_array($extension, config('documents.allowed_extensions'), true), 422, 'Unsupported document extension.');
        $path = 'employee-documents/'.$documentId.'/'.Str::uuid().'.'.$extension;
        $stored = Storage::disk($diskName)->putFileAs(
            dirname($path),
            $file,
            basename($path),
            ['visibility' => 'private'],
        );
        if (! $stored) {
            throw new RuntimeException('The document file could not be stored.');
        }

        return $stored;
    }

    private function isManagedPath(string $path, string $documentId): bool
    {
        return Str::startsWith($path, 'employee-documents/'.$documentId.'/')
            && ! str_contains($path, '..')
            && ! str_contains($path, '\\');
    }

    private function isArchived(EmployeeDocument $document): bool
    {
        return $document->status === 'archived' || $document->archived_at !== null;
    }

    private function notifyEmployee(Employee $employee, EmployeeDocument $document, string $type, string $title, string $body, string $event): void
    {
        $user = $employee->user;
        if (! $user) {
            return;
        }

        EmployeeNotification::firstOrCreate(
            ['deduplication_key' => 'document:'.$document->id.':'.$event.':'.($document->reviewed_at?->timestamp ?? $document->updated_at?->timestamp ?? now()->timestamp)],
            [
                'recipient_user_id' => $user->id,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'resource_type' => 'employee_document',
                'resource_id' => (string) $document->id,
            ],
        );
    }

    private function notifyReviewers(EmployeeDocument $document, string $body): void
    {
        $reviewers = DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->join('user_roles', 'user_roles.role_id', '=', 'role_permissions.role_id')
            ->where('permissions.key', 'people.document.review')
            ->where(fn ($query) => $query->whereNull('user_roles.valid_from')->orWhere('user_roles.valid_from', '<=', now()))
            ->where(fn ($query) => $query->whereNull('user_roles.valid_until')->orWhere('user_roles.valid_until', '>', now()))
            ->distinct()
            ->pluck('user_roles.user_id');
        foreach ($reviewers as $userId) {
            EmployeeNotification::firstOrCreate(
                ['deduplication_key' => 'document:'.$document->id.':review:'.$document->updated_at?->timestamp.':'.$userId],
                [
                    'recipient_user_id' => $userId,
                    'type' => 'document.submitted',
                    'title' => 'Document submitted for review',
                    'body' => $body,
                    'resource_type' => 'employee_document',
                    'resource_id' => (string) $document->id,
                ],
            );
        }
    }

    private function serialize(EmployeeDocument $document): array
    {
        $status = $document->status;
        if ($status === 'approved' && $document->expiry_date?->lt(today())) {
            $status = 'expired';
        }

        $workflow = $document->relationLoaded('workflowInstances')
            ? $document->workflowInstances->first()
            : $document->workflowInstances()->first();

        return [
            'id' => $document->id,
            'employee_id' => $document->employee_id,
            'employee' => $document->employee ? [
                'first_name' => $document->employee->first_name,
                'last_name' => $document->employee->last_name,
                'name' => trim($document->employee->first_name.' '.$document->employee->last_name),
            ] : null,
            'name' => $document->name,
            'type' => $document->type,
            'uploaded_at' => $document->uploaded_at?->toDateString(),
            'issue_date' => $document->issue_date?->toDateString(),
            'expiry_date' => $document->expiry_date?->toDateString(),
            'status' => $status,
            'has_file' => filled($document->file_path),
            'mime_type' => $document->mime_type,
            'file_size' => $document->file_size,
            'review_comment' => $document->review_comment,
            'reviewed_at' => $document->reviewed_at?->toISOString(),
            'archived_at' => $document->archived_at?->toISOString(),
            'workflow_instance' => $workflow ? [
                'id' => $workflow->id,
                'status' => $workflow->status,
            ] : null,
        ];
    }

    private function startDocumentWorkflowIfConfigured(
        Request $request,
        EmployeeDocument $document,
        AuditLogger $audit,
        WorkflowEngine $workflow,
    ): bool {
        $hasPublishedTemplate = WorkflowTemplate::query()
            ->where('module', 'documents')
            ->where('resource_type', 'document')
            ->where('is_active', true)
            ->whereHas('versions', fn (Builder $query) => $query->where('status', 'published'))
            ->exists();
        if (! $hasPublishedTemplate) {
            return false;
        }

        $workflow->startForResource(
            $request->user(),
            'documents',
            'document',
            (string) $document->id,
            $audit,
            'document-file:'.hash('sha256', (string) $document->file_path),
        );

        return true;
    }
}
