<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_documents', function (Blueprint $table) {
            $table->date('issue_date')->nullable()->after('uploaded_at');
            $table->string('storage_disk', 50)->nullable()->after('file_path');
            $table->string('mime_type', 100)->nullable()->after('storage_disk');
            $table->unsignedBigInteger('file_size')->nullable()->after('mime_type');
            $table->text('review_comment')->nullable()->after('status');
            $table->foreignUuid('reviewed_by_user_id')->nullable()->after('review_comment')->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by_user_id');
            $table->timestamp('archived_at')->nullable()->after('reviewed_at');
            $table->index(['status', 'expiry_date']);
        });

        $permissions = [
            'people.document.upload' => ['people', 'document', 'upload'],
            'people.document.review' => ['people', 'document', 'review'],
            'people.document.archive' => ['people', 'document', 'archive'],
            'people.document.delete' => ['people', 'document', 'delete'],
        ];
        foreach ($permissions as $key => [$module, $resource, $action]) {
            DB::table('permissions')->insertOrIgnore([
                'id' => (string) Str::uuid(),
                'key' => $key,
                'module' => $module,
                'resource' => $resource,
                'action' => $action,
                'scope' => 'explicit',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $grants = [
            'super-admin' => array_keys($permissions),
            'hr-admin' => array_keys($permissions),
            'hr-manager' => array_keys($permissions),
            'employee' => ['people.document.upload'],
        ];
        foreach ($grants as $roleKey => $keys) {
            $roleId = DB::table('roles')->where('key', $roleKey)->value('id');
            if (! $roleId) {
                continue;
            }
            $permissionIds = DB::table('permissions')->whereIn('key', $keys)->pluck('id');
            foreach ($permissionIds as $permissionId) {
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roleId,
                    'permission_id' => $permissionId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('employee_documents', function (Blueprint $table) {
            $table->dropIndex(['status', 'expiry_date']);
            $table->dropConstrainedForeignId('reviewed_by_user_id');
            $table->dropColumn([
                'issue_date',
                'storage_disk',
                'mime_type',
                'file_size',
                'review_comment',
                'reviewed_at',
                'archived_at',
            ]);
        });
    }
};
