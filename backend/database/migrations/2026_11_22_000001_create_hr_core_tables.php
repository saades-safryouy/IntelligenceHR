<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->string('id')->primary(); // short ids: eng, ops, sales, finance, people
            $table->string('name');
            $table->string('code')->nullable();
            $table->text('description')->nullable();
            $table->unsignedBigInteger('manager_id')->nullable();
            $table->integer('employee_count')->default(0);
            $table->decimal('budget', 15, 2)->nullable();
            $table->string('parent_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->uuid('user_id')->nullable()->index();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('job_title')->nullable();
            $table->string('department_id')->nullable()->index();
            $table->string('team_id')->nullable();
            $table->string('position_id')->nullable();
            $table->string('position_title')->nullable();
            $table->unsignedBigInteger('manager_id')->nullable()->index();
            $table->string('employment_type')->nullable();
            $table->string('status')->default('Active');
            $table->string('location')->nullable();
            $table->string('country', 2)->nullable();
            $table->date('joined_at')->nullable();
            $table->string('email')->nullable()->unique();
            $table->string('gender')->nullable();
            $table->string('marital_status')->nullable();
            $table->integer('number_of_children')->nullable();
            $table->string('national_id')->nullable();
            $table->integer('nationality_id')->nullable();
            $table->string('passport_number')->nullable();
            $table->date('passport_validity_date')->nullable();
            $table->string('personal_phone')->nullable();
            $table->string('professional_phone')->nullable();
            $table->timestamp('personal_info_completed_at')->nullable();
            $table->timestamp('personal_info_dismissed_until')->nullable();
            $table->string('emergency_contact_name')->nullable();
            $table->string('emergency_contact_phone')->nullable();
            $table->string('emergency_contact_relationship')->nullable();
            $table->string('onboarding_status')->nullable();
            $table->string('onboarding_approval_status')->nullable();
            $table->string('offboarding_status')->nullable();
            $table->string('offboarding_approval_status')->nullable();
            $table->timestamps();
        });

        Schema::create('reporting_relationships', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id')->index();
            $table->unsignedBigInteger('manager_employee_id')->nullable()->index();
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_primary')->default(true);
            $table->timestamps();
        });

        Schema::create('leave_types', function (Blueprint $table) {
            $table->string('id')->primary(); // annual, sick, unpaid
            $table->string('code')->nullable();
            $table->string('name_key');
            $table->string('color')->default('#3b82f6');
            $table->boolean('paid')->default(true);
        });

        Schema::create('leave_entitlements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id')->index();
            $table->string('leave_type_id')->index();
            $table->integer('entitlement')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_entitlements');
        Schema::dropIfExists('leave_types');
        Schema::dropIfExists('reporting_relationships');
        Schema::dropIfExists('employees');
        Schema::dropIfExists('departments');
    }
};
