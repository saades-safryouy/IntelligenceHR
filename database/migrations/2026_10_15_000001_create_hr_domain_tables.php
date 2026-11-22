<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_types', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->unique();
            $table->string('name_key');
            $table->string('color')->default('#3b82f6');
            $table->boolean('paid')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('leave_entitlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('leave_type_id')->constrained('leave_types')->cascadeOnDelete();
            $table->decimal('entitlement', 5, 2)->default(0);
            $table->unsignedSmallInteger('year');
            $table->timestamps();
            $table->unique(['employee_id', 'leave_type_id', 'year']);
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('leave_type_id')->constrained('leave_types')->restrictOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('from_half', 10)->default('full');
            $table->string('to_half', 10)->default('full');
            $table->decimal('duration', 5, 2);
            $table->foreignId('backup_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->text('note')->nullable();
            $table->string('status', 20)->default('pending');
            $table->timestamp('submitted_at');
            $table->timestamps();
            $table->index(['employee_id', 'status']);
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('name_key')->nullable();
            $table->date('date');
            $table->unsignedTinyInteger('days')->default(1);
            $table->boolean('recurring')->default(false);
            $table->string('type', 20)->default('Public');
            $table->string('country', 2)->nullable();
            $table->string('site')->nullable();
            $table->timestamps();
            $table->index(['date', 'country']);
        });

        Schema::create('onboarding_cases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->string('employee_name');
            $table->string('position');
            $table->string('department');
            $table->date('start_date');
            $table->string('stage', 50)->default('HR Validation');
            $table->string('assignee')->nullable();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('status', 30)->default('On track');
            $table->timestamps();
        });

        Schema::create('onboarding_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('onboarding_case_id')->constrained('onboarding_cases')->cascadeOnDelete();
            $table->string('label_key');
            $table->boolean('done')->default(false);
            $table->date('due_date')->nullable();
            $table->boolean('employee_visible')->default(true);
            $table->timestamps();
        });

        Schema::create('offboarding_cases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->string('employee_name');
            $table->date('exit_date');
            $table->string('reason');
            $table->string('replacement')->nullable();
            $table->string('stage', 50)->default('Pending');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('status', 30)->default('On track');
            $table->timestamps();
        });

        Schema::create('employee_documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type');
            $table->date('uploaded_at');
            $table->date('expiry_date')->nullable();
            $table->string('status', 30)->default('valid');
            $table->string('file_path')->nullable();
            $table->timestamps();
            $table->index(['employee_id', 'status']);
        });

        Schema::create('user_preferences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('theme', 20)->default('dark');
            $table->string('language', 10)->default('en');
            $table->json('settings')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_preferences');
        Schema::dropIfExists('employee_documents');
        Schema::dropIfExists('offboarding_cases');
        Schema::dropIfExists('onboarding_tasks');
        Schema::dropIfExists('onboarding_cases');
        Schema::dropIfExists('holidays');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('leave_entitlements');
        Schema::dropIfExists('leave_types');
    }
};
