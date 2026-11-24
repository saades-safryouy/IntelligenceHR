<?php

namespace App\Http\Controllers;

use App\Models\EmployeeDocument;
use App\Support\ApiPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
{
    public function index(Request $request)
    {
        $query = EmployeeDocument::with('employee')->orderByDesc('uploaded_at');

        if (! $this->can('people.employee.view.all')) {
            $me = $this->myEmployee();
            $query->where('employee_id', $me?->id ?? 0);
        }
        if ($employeeId = $request->query('employeeId')) {
            $query->where('employee_id', $employeeId);
        }
        if ($category = $request->query('category')) {
            $query->where('type', $category);
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $query->where('name', 'like', "%{$search}%");
        }
        if ($before = $request->query('expiresBefore')) {
            $query->where('expiry_date', '<', $before);
        }
        if ($after = $request->query('expiresAfter')) {
            $query->where('expiry_date', '>', $after);
        }
        if ($request->query('hasExpiry') === '1') {
            $query->whereNotNull('expiry_date');
        } elseif ($request->query('hasExpiry') === '0') {
            $query->whereNull('expiry_date');
        }

        return response()->json(['data' => $query->get()
            ->map(fn ($d) => ApiPresenter::document($d))->values()->all()]);
    }

    public function show(EmployeeDocument $employeeDocument)
    {
        $employeeDocument->load('employee');

        return response()->json(['data' => ApiPresenter::document($employeeDocument)]);
    }

    public function store(Request $request)
    {
        if (! $this->can('people.document.upload')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'max:100'],
            'issue_date' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'file' => ['nullable', 'file', 'max:20480'],
        ]);

        $doc = EmployeeDocument::create([
            'employee_id' => $data['employee_id'],
            'name' => $data['name'],
            'type' => $data['type'],
            'issue_date' => $data['issue_date'] ?? null,
            'expiry_date' => $data['expiry_date'] ?? null,
            'status' => 'pending',
            'uploaded_at' => now(),
        ]);
        if ($request->hasFile('file')) {
            $this->attachFile($doc, $request->file('file'));
        }
        $this->logAudit('document.created', 'employee_document', $doc->id, $doc->name);
        $doc->load('employee');

        return response()->json(['data' => ApiPresenter::document($doc)], 201);
    }

    public function update(Request $request, EmployeeDocument $employeeDocument)
    {
        if (! $this->can('people.document.upload')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'type' => ['sometimes', 'required', 'string', 'max:100'],
            'issue_date' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
        ]);
        $employeeDocument->update($data);
        $this->logAudit('document.updated', 'employee_document', $employeeDocument->id, $employeeDocument->name);
        $employeeDocument->load('employee');

        return response()->json(['data' => ApiPresenter::document($employeeDocument)]);
    }

    public function destroy(EmployeeDocument $employeeDocument)
    {
        if (! $this->can('people.document.delete')) {
            return $this->forbidden();
        }
        if ($employeeDocument->file_path) {
            Storage::disk('public')->delete($employeeDocument->file_path);
        }
        $employeeDocument->delete();
        $this->logAudit('document.deleted', 'employee_document', $employeeDocument->id, $employeeDocument->name);

        return response()->noContent();
    }

    /** POST /employee-documents/{id}/file — (re-)upload the file for a record. */
    public function uploadFile(Request $request, EmployeeDocument $employeeDocument)
    {
        if (! $this->can('people.document.upload')) {
            return $this->forbidden();
        }
        $request->validate(['file' => ['required', 'file', 'max:20480']]);
        if ($employeeDocument->file_path) {
            Storage::disk('public')->delete($employeeDocument->file_path);
        }
        $this->attachFile($employeeDocument, $request->file('file'));
        $employeeDocument->load('employee');

        return response()->json(['data' => ApiPresenter::document($employeeDocument)]);
    }

    /** GET /employee-documents/{id}/file — download (?inline=1 previews). */
    public function download(Request $request, EmployeeDocument $employeeDocument)
    {
        if (! $employeeDocument->file_path || ! Storage::disk('public')->exists($employeeDocument->file_path)) {
            return response()->json(['message' => 'File not found.'], 404);
        }
        $filename = $employeeDocument->name;
        if ($employeeDocument->mime_type && ! str_contains($filename, '.')) {
            $ext = explode('/', $employeeDocument->mime_type)[1] ?? null;
            if ($ext) {
                $filename .= '.'.$ext;
            }
        }

        return Storage::disk('public')->download(
            $employeeDocument->file_path,
            $filename,
            ['Content-Disposition' => ($request->query('inline') ? 'inline' : 'attachment').'; filename="'.$filename.'"']
        );
    }

    public function review(Request $request, EmployeeDocument $employeeDocument)
    {
        if (! $this->can('people.document.review')) {
            return $this->forbidden();
        }
        $data = $request->validate([
            'status' => ['required', 'string', 'in:approved,rejected'],
            'comment' => ['nullable', 'string'],
        ]);
        $employeeDocument->update([
            'status' => $data['status'],
            'review_comment' => $data['comment'] ?? null,
            'reviewed_at' => now(),
        ]);
        $this->logAudit('document.reviewed', 'employee_document', $employeeDocument->id, $data['status']);
        $employeeDocument->load('employee');

        return response()->json(['data' => ApiPresenter::document($employeeDocument)]);
    }

    public function archive(EmployeeDocument $employeeDocument)
    {
        if (! $this->can('people.document.archive')) {
            return $this->forbidden();
        }
        $employeeDocument->update(['status' => 'archived']);
        $this->logAudit('document.archived', 'employee_document', $employeeDocument->id, $employeeDocument->name);
        $employeeDocument->load('employee');

        return response()->json(['data' => ApiPresenter::document($employeeDocument)]);
    }

    private function attachFile(EmployeeDocument $doc, $file): void
    {
        $path = $file->storeAs(
            'documents/'.$doc->id,
            time().'_'.preg_replace('/[^A-Za-z0-9._-]/', '_', $file->getClientOriginalName()),
            'public'
        );
        $doc->update([
            'file_path' => $path,
            'has_file' => true,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
        ]);
    }
}
