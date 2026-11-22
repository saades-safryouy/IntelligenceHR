<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->unique();
            $table->string('name');
            $table->uuid('parent_department_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['parent_department_id', 'is_active']);
        });

        Schema::table('departments', function (Blueprint $table) {
            $table->foreign('parent_department_id')->references('id')->on('departments')->restrictOnDelete();
        });

        Schema::create('teams', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('department_id')->constrained()->restrictOnDelete();
            $table->string('code');
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['department_id', 'code']);
        });

        Schema::create('positions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('department_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('code')->unique();
            $table->string('title');
            $table->uuid('reports_to_position_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['department_id', 'is_active']);
        });

        Schema::table('positions', function (Blueprint $table) {
            $table->foreign('reports_to_position_id')->references('id')->on('positions')->restrictOnDelete();
        });

        Schema::create('employees', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('first_name');
            $table->string('last_name');
            $table->string('job_title');
            $table->foreignUuid('department_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUuid('team_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUuid('position_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('employment_type')->nullable();
            $table->string('status')->default('Active');
            $table->string('location')->nullable();
            $table->string('country', 2)->nullable();
            $table->date('joined_at')->nullable();
            $table->string('email')->nullable()->index();
            $table->string('gender')->nullable();
            $table->string('marital_status')->nullable();
            $table->unsignedSmallInteger('number_of_children')->nullable();
            $table->string('national_id')->nullable();
            $table->unsignedSmallInteger('nationality_id')->nullable();
            $table->string('passport_number')->nullable();
            $table->date('passport_validity_date')->nullable();
            $table->string('personal_phone')->nullable();
            $table->string('professional_phone')->nullable();
            $table->timestamp('personal_info_completed_at')->nullable();
            $table->timestamp('personal_info_dismissed_until')->nullable();
            $table->string('emergency_contact_name')->nullable();
            $table->string('emergency_contact_phone')->nullable();
            $table->string('emergency_contact_relationship')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['department_id', 'status']);
            $table->index(['team_id', 'status']);
            $table->index(['position_id', 'status']);
            $table->index(['last_name', 'first_name']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignIdFor(\App\Models\Employee::class)->nullable()->unique()->constrained()->restrictOnDelete();
        });

        Schema::create('employee_reporting_relationships', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->foreignId('manager_employee_id')->constrained('employees')->restrictOnDelete();
            $table->boolean('is_primary')->default(true);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['employee_id', 'is_primary', 'effective_from', 'effective_to'], 'reporting_employee_dates_idx');
            $table->index(['manager_employee_id', 'effective_from', 'effective_to'], 'reporting_manager_dates_idx');
        });

        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('key')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('key')->unique();
            $table->string('module');
            $table->string('resource');
            $table->string('action');
            $table->string('scope')->default('explicit');
            $table->timestamps();
            $table->unique(['module', 'resource', 'action', 'scope'], 'permissions_module_resource_action_scope_unique');
        });

        Schema::create('user_roles', function (Blueprint $table) {
            $table->uuid('user_id');
            $table->uuid('role_id');
            $table->foreignUuid('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->timestamps();
            $table->primary(['user_id', 'role_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
            $table->index(['role_id', 'valid_from', 'valid_until']);
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->uuid('role_id');
            $table->uuid('permission_id');
            $table->timestamps();
            $table->primary(['role_id', 'permission_id']);
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('permission_id')->references('id')->on('permissions')->restrictOnDelete();
        });

        Schema::create('role_scope_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignUuid('role_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('scope_kind');
            $table->string('scope_id');
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->foreignUuid('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['user_id', 'scope_kind', 'scope_id']);
            $table->index(['role_id', 'scope_kind', 'scope_id']);
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action');
            $table->string('target_type');
            $table->string('target_id');
            $table->string('outcome')->default('success');
            $table->json('changes')->nullable();
            $table->uuid('correlation_id')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['target_type', 'target_id', 'occurred_at']);
            $table->index(['actor_user_id', 'occurred_at']);
            $table->index(['action', 'occurred_at']);
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('recipient_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('resource_type')->nullable();
            $table->string('resource_id')->nullable();
            $table->string('deduplication_key')->nullable()->unique();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['recipient_user_id', 'read_at', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('role_scope_assignments');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('user_roles');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('employee_reporting_relationships');
        Schema::table('users', fn (Blueprint $table) => $table->dropConstrainedForeignId('employee_id'));
        Schema::dropIfExists('employees');
        Schema::dropIfExists('positions');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('departments');
    }
};
