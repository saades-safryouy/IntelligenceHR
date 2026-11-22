<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('onboarding_cases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('employee_id')->index();
            $table->string('employee_name');
            $table->string('position')->nullable();
            $table->string('department')->nullable();
            $table->date('start_date')->nullable();
            $table->string('stage')->default('HR Validation');
            $table->string('assignee')->nullable();
            $table->integer('progress')->default(0);
            $table->string('status')->default('On track');
            $table->string('approval_status')->nullable();
            $table->timestamps();
        });

        Schema::create('onboarding_tasks', function (Blueprint $table) {
            $table->id();
            $table->uuid('onboarding_case_id')->index();
            $table->string('label_key');
            $table->boolean('done')->default(false);
            $table->date('due_date')->nullable();
            $table->boolean('employee_visible')->default(true);
            $table->timestamps();
        });

        Schema::create('offboarding_cases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('employee_id')->index();
            $table->string('employee_name');
            $table->date('exit_date')->nullable();
            $table->string('reason')->nullable();
            $table->string('replacement')->nullable();
            $table->string('stage')->default('HR Validation');
            $table->integer('progress')->default(0);
            $table->string('status')->default('On track');
            $table->string('approval_status')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offboarding_cases');
        Schema::dropIfExists('onboarding_tasks');
        Schema::dropIfExists('onboarding_cases');
    }
};
