<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('review_cycles', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->date('period_start');
            $table->date('period_end');
            $table->string('status')->default('draft'); // draft | active | closed
            $table->timestamps();
        });

        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id')->index();
            $table->unsignedBigInteger('reviewer_id')->nullable()->index();
            $table->foreignId('cycle_id')->constrained('review_cycles')->cascadeOnDelete();
            $table->unsignedTinyInteger('rating')->nullable(); // 1-5
            $table->text('strengths')->nullable();
            $table->text('improvements')->nullable();
            $table->text('feedback')->nullable();
            $table->string('status')->default('draft'); // draft | submitted
            $table->timestamps();
        });

        Schema::create('goals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id')->index();
            $table->string('title');
            $table->text('description')->nullable();
            $table->date('target_date')->nullable();
            $table->string('status')->default('not_started'); // not_started | in_progress | completed
            $table->unsignedTinyInteger('progress')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goals');
        Schema::dropIfExists('performance_reviews');
        Schema::dropIfExists('review_cycles');
    }
};
