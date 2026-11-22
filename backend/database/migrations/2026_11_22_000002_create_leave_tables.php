<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('employee_id')->index();
            $table->string('leave_type_id')->index();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('from_half', 10)->default('full');
            $table->string('to_half', 10)->default('full');
            $table->decimal('duration', 8, 2)->default(0);
            $table->unsignedBigInteger('backup_employee_id')->nullable();
            $table->text('note')->nullable();
            $table->string('status')->default('pending');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('name_key')->nullable();
            $table->date('date');
            $table->integer('days')->default(1);
            $table->boolean('recurring')->default(false);
            $table->string('type')->default('Public');
            $table->string('country', 2)->nullable();
            $table->string('site')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
        Schema::dropIfExists('leave_requests');
    }
};
