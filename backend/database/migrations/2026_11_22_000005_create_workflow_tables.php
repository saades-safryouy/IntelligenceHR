<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('key')->unique();
            $table->string('module');
            $table->string('resource_type');
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('workflow_template_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('workflow_template_id')->index();
            $table->integer('version_number')->default(1);
            $table->string('status')->default('draft'); // draft | published
            $table->json('steps')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });

        // Steps/assignments are stored as JSON on the instance (see
        // WorkflowInstance::$casts) — no separate steps/assignments tables.
        Schema::create('workflow_instances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('initiator_user_id')->index();
            $table->string('resource_type');
            $table->string('resource_id')->index();
            $table->string('status')->default('pending');
            $table->json('steps')->nullable();
            $table->integer('current_step')->default(0);
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        // One row per decision/event; history endpoint reads this table.
        Schema::create('workflow_actions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('workflow_instance_id')->index();
            $table->string('assignment_id')->nullable();
            $table->string('action');
            $table->text('comment')->nullable();
            $table->uuid('actor_user_id')->index();
            $table->timestamp('occurred_at')->nullable();
        });

        Schema::create('workflow_delegations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('delegator_user_id')->index();
            $table->uuid('delegate_user_id')->index();
            $table->string('approval_assignment_id')->nullable()->index();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->nullable()->index();
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('type')->default('info');
            $table->string('resource_type')->nullable();
            $table->string('resource_id')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('workflow_delegations');
        Schema::dropIfExists('workflow_actions');
        Schema::dropIfExists('workflow_instances');
        Schema::dropIfExists('workflow_template_versions');
        Schema::dropIfExists('workflow_templates');
    }
};
