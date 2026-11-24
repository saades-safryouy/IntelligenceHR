<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('jobs', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('department_id')->index();
            $table->text('description')->nullable();
            $table->string('location')->default('Casablanca');
            $table->string('employment_type')->default('Full-time');
            $table->string('status')->default('open'); // open | closed
            $table->timestamps();
        });

        Schema::create('candidates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('phone')->nullable();
            $table->string('cv_path')->nullable();
            $table->string('cv_mime')->nullable();
            $table->unsignedBigInteger('cv_size')->nullable();
            $table->timestamps();
        });

        Schema::create('job_applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_id')->constrained('jobs')->cascadeOnDelete();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->string('stage')->default('applied'); // applied | screening | interview | offer | hired | rejected
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('onboarding_case_id')->nullable()->index();
            $table->timestamps();
            $table->unique(['job_id', 'candidate_id']);
        });

        Schema::create('interviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('job_applications')->cascadeOnDelete();
            $table->dateTime('scheduled_at');
            $table->string('interviewer')->nullable();
            $table->text('notes')->nullable();
            $table->string('outcome')->default('pending'); // pending | passed | failed
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interviews');
        Schema::dropIfExists('job_applications');
        Schema::dropIfExists('candidates');
        Schema::dropIfExists('jobs');
    }
};
