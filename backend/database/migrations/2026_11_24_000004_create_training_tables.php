<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('training_courses', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('category')->default('General');
            $table->unsignedInteger('duration_hours')->default(0);
            $table->string('provider')->nullable();
            $table->string('status')->default('active'); // active | archived
            $table->timestamps();
        });

        Schema::create('training_enrollments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id')->index();
            $table->foreignId('course_id')->constrained('training_courses')->cascadeOnDelete();
            $table->string('status')->default('enrolled'); // enrolled | in_progress | completed
            $table->unsignedTinyInteger('progress')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'course_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('training_enrollments');
        Schema::dropIfExists('training_courses');
    }
};
