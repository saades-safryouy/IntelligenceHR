<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\EmployeeNotification;
use App\Models\User;
use App\Models\WorkflowInstance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\CreatesApiIdentity;
use Tests\TestCase;

class DocumentApiTest extends TestCase
{
    use CreatesApiIdentity;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['documents.disk' => 'local']);
    }

    public function test_employee_can_upload_only_an_hr_requested_document_and_download_their_own_file(): void
    {
        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();
        $user = $this->createUserWithPermissions(
            ['people.employee.self.view', 'people.document.upload'],
            ['employee_id' => $employee->id],
        );
        $hr = $this->createUserWithPermissions([
            'people.employee.view.all',
            'people.employee.update',
            'people.document.upload',
        ]);
        $requested = $this->actingAs($hr)->postJson('/api/v1/employee-documents', [
            'employee_id' => $employee->id,
            'name' => 'Passport',
            'type' => 'identity',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'missing')
            ->assertJsonPath('data.has_file', false)
            ->json('data');
        $otherDocument = EmployeeDocument::create([
            'employee_id' => $otherEmployee->id,
            'name' => 'Private contract',
            'type' => 'contracts',
            'uploaded_at' => today(),
            'status' => 'missing',
        ]);

        $this->actingAs($user)->postJson('/api/v1/employee-documents', [
            'employee_id' => $employee->id,
            'name' => 'Unrequested file',
            'type' => 'identity',
        ])->assertForbidden();

        $this->actingAs($user)->post('/api/v1/employee-documents/'.$requested['id'].'/file', [
            'file' => UploadedFile::fake()->createWithContent('passport.pdf', "%PDF-1.4\npassport"),
        ])->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.has_file', true);

        $document = EmployeeDocument::findOrFail($requested['id']);
        Storage::disk('local')->assertExists($document->file_path);
        $this->get('/api/v1/employee-documents/'.$document->id.'/file')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->getJson('/api/v1/employee-documents/'.$otherDocument->id)
            ->assertNotFound();
        $this->post('/api/v1/employee-documents/'.$otherDocument->id.'/file', [
            'file' => UploadedFile::fake()->createWithContent('other.pdf', "%PDF-1.4\nother"),
        ])->assertNotFound();
        $this->assertDatabaseMissing('employee_documents', [
            'employee_id' => $otherEmployee->id,
            'name' => 'other.jpg',
        ]);
    }

    public function test_hr_can_review_reject_and_archive_documents_with_employee_notifications(): void
    {
        $employee = Employee::factory()->create();
        $employeeUser = User::factory()->create(['employee_id' => $employee->id]);
        $hr = $this->createUserWithPermissions([
            'people.employee.view.all',
            'people.employee.update',
            'people.document.upload',
            'people.document.review',
            'people.document.archive',
            'people.document.delete',
        ]);
        $document = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'name' => 'Employment certificate',
            'type' => 'employment',
            'uploaded_at' => today(),
            'status' => 'pending',
            'file_path' => null,
        ]);
        Storage::disk('local')->put('employee-documents/'.$document->id.'/file.pdf', '%PDF-1.7');
        $document->update([
            'file_path' => 'employee-documents/'.$document->id.'/file.pdf',
            'storage_disk' => 'local',
            'mime_type' => 'application/pdf',
        ]);

        $this->actingAs($hr)->postJson('/api/v1/employee-documents/'.$document->id.'/review', [
            'status' => 'rejected',
            'comment' => 'Please provide a clearer scan.',
        ])->assertOk()->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.review_comment', 'Please provide a clearer scan.');
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $employeeUser->id,
            'type' => 'document.rejected',
            'resource_type' => 'employee_document',
            'resource_id' => $document->id,
        ]);

        $this->actingAs($hr)->postJson('/api/v1/employee-documents/'.$document->id.'/archive')
            ->assertOk()->assertJsonPath('data.status', 'archived');
        $this->get('/api/v1/employee-documents/'.$document->id.'/file')->assertForbidden();
        Storage::disk('local')->assertExists('employee-documents/'.$document->id.'/file.pdf');
    }

    public function test_upload_rejects_executable_files_and_employees_cannot_review_documents(): void
    {
        $employee = Employee::factory()->create();
        $employeeUser = $this->createUserWithPermissions(
            ['people.employee.self.view', 'people.document.upload'],
            ['employee_id' => $employee->id],
        );
        $document = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'name' => 'Identity file',
            'type' => 'identity',
            'uploaded_at' => today(),
            'status' => 'missing',
        ]);

        $this->actingAs($employeeUser)->post('/api/v1/employee-documents/'.$document->id.'/file', [
            'file' => UploadedFile::fake()->create('payload.php', 5, 'application/x-php'),
        ])->assertUnprocessable();
        $this->postJson('/api/v1/employee-documents/'.$document->id.'/review', ['status' => 'approved'])
            ->assertForbidden();
        $this->assertDatabaseHas('employee_documents', ['id' => $document->id, 'status' => 'missing']);
    }

    public function test_expiry_command_notifies_once_per_document_expiry_date(): void
    {
        $employee = Employee::factory()->create();
        $user = User::factory()->create(['employee_id' => $employee->id]);
        $document = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'name' => 'Passport',
            'type' => 'identity',
            'uploaded_at' => today(),
            'expiry_date' => today()->addDays(20),
            'status' => 'approved',
        ]);

        Artisan::call('documents:notify-expiring');
        Artisan::call('documents:notify-expiring');

        $this->assertSame(1, EmployeeNotification::where('recipient_user_id', $user->id)
            ->where('resource_id', $document->id)
            ->where('type', 'document.expiring')
            ->count());
    }

    public function test_published_document_workflow_controls_review_and_synchronizes_document_outcome(): void
    {
        $employee = Employee::factory()->create();
        $employeeUser = $this->createUserWithPermissions(
            ['people.employee.self.view', 'people.document.upload'],
            ['employee_id' => $employee->id],
        );
        $hr = $this->createUserWithPermissions([
            'people.employee.view.all',
            'people.employee.update',
            'people.document.upload',
            'people.document.review',
            'workflow.template.create',
            'workflow.template.update',
            'workflow.template.publish',
        ]);
        $approver = $this->createUserWithPermissions(['workflow.approve']);
        $this->createPublishedDocumentWorkflow($hr, $approver);

        $document = $this->actingAs($hr)->postJson('/api/v1/employee-documents', [
            'employee_id' => $employee->id,
            'name' => 'Passport',
            'type' => 'identity',
        ])->assertCreated()->json('data');

        $this->actingAs($employeeUser)->post('/api/v1/employee-documents/'.$document['id'].'/file', [
            'file' => UploadedFile::fake()->createWithContent('passport.pdf', "%PDF-1.4\npassport"),
        ])->assertOk()
            ->assertJsonPath('data.status', 'under_review')
            ->assertJsonPath('data.workflow_instance.status', 'pending_approval');

        $instance = WorkflowInstance::query()->where('resource_id', $document['id'])->firstOrFail();
        $assignment = $instance->steps()->firstOrFail()->assignments()->firstOrFail();
        $this->actingAs($hr)->postJson('/api/v1/employee-documents/'.$document['id'].'/review', [
            'status' => 'approved',
        ])->assertStatus(409);

        $this->actingAs($approver)->postJson('/api/v1/workflow-instances/'.$instance->id.'/actions', [
            'assignmentId' => $assignment->id,
            'action' => 'approve',
            'comment' => 'The scan is clear.',
            'idempotencyKey' => 'approve-document-'.$document['id'],
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertDatabaseHas('employee_documents', [
            'id' => $document['id'],
            'status' => 'approved',
            'review_comment' => 'The scan is clear.',
            'reviewed_by_user_id' => $approver->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $employeeUser->id,
            'type' => 'document.approved',
            'resource_type' => 'employee_document',
            'resource_id' => $document['id'],
        ]);

        $secondDocument = $this->actingAs($hr)->postJson('/api/v1/employee-documents', [
            'employee_id' => $employee->id,
            'name' => 'Employment certificate',
            'type' => 'employment',
        ])->assertCreated()->json('data');
        $this->actingAs($employeeUser)->post('/api/v1/employee-documents/'.$secondDocument['id'].'/file', [
            'file' => UploadedFile::fake()->createWithContent('certificate.pdf', "%PDF-1.4\ncertificate"),
        ])->assertOk();
        $secondInstance = WorkflowInstance::query()->where('resource_id', $secondDocument['id'])->firstOrFail();
        $secondAssignment = $secondInstance->steps()->firstOrFail()->assignments()->firstOrFail();
        $this->actingAs($approver)->postJson('/api/v1/workflow-instances/'.$secondInstance->id.'/actions', [
            'assignmentId' => $secondAssignment->id,
            'action' => 'reject',
            'comment' => 'The certificate is out of date.',
            'idempotencyKey' => 'reject-document-'.$secondDocument['id'],
        ])->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertDatabaseHas('employee_documents', [
            'id' => $secondDocument['id'],
            'status' => 'rejected',
            'review_comment' => 'The certificate is out of date.',
        ]);
        $this->assertDatabaseHas('notifications', [
            'recipient_user_id' => $employeeUser->id,
            'type' => 'document.rejected',
            'resource_type' => 'employee_document',
            'resource_id' => $secondDocument['id'],
        ]);

        $this->actingAs($employeeUser)->post('/api/v1/employee-documents/'.$secondDocument['id'].'/file', [
            'file' => UploadedFile::fake()->createWithContent('certificate-updated.pdf', "%PDF-1.4\nupdated"),
        ])->assertOk()->assertJsonPath('data.status', 'under_review');
        $this->assertSame(2, WorkflowInstance::query()->where('resource_id', $secondDocument['id'])->count());
    }

    private function createPublishedDocumentWorkflow(User $initiator, User $approver): void
    {
        $template = $this->actingAs($initiator)->postJson('/api/v1/workflow-templates', [
            'key' => 'document-approval',
            'module' => 'documents',
            'resourceType' => 'document',
            'name' => 'Document approval',
        ])->assertCreated()->json('data');
        $version = $this->postJson('/api/v1/workflow-templates/'.$template['id'].'/versions', [
            'steps' => [[
                'key' => 'review',
                'sequence' => 1,
                'groupKey' => 'review',
                'mode' => 'sequential',
                'completionRule' => 'all',
                'approverRule' => ['type' => 'user', 'userIds' => [$approver->id]],
            ]],
        ])->assertCreated()->json('data');

        $this->postJson('/api/v1/workflow-template-versions/'.$version['id'].'/publish')
            ->assertOk()
            ->assertJsonPath('data.status', 'published');
    }
}
