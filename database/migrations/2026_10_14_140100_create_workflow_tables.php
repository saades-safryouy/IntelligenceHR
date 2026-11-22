<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // =========================================================
        // 1. WORKFLOW TEMPLATES
        // =========================================================

        Schema::create('workflow_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->string('key')->unique('wf_templates_key_uq');
            $table->string('module');
            $table->string('resource_type');
            $table->string('name');
            $table->boolean('is_active')->default(true);

            $table->foreignUuid('created_by')->nullable();

            $table->foreign('created_by', 'wf_templates_creator_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();

            $table->timestamps();
        });

        // =========================================================
        // 2. WORKFLOW TEMPLATE VERSIONS
        // =========================================================

        Schema::create('workflow_template_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_template_id');

            $table->foreign('workflow_template_id', 'wf_versions_template_fk')
                ->references('id')
                ->on('workflow_templates')
                ->restrictOnDelete();

            $table->unsignedInteger('version_number');
            $table->string('status')->default('draft');
            $table->timestamp('published_at')->nullable();

            $table->foreignUuid('published_by')->nullable();

            $table->foreign('published_by', 'wf_versions_publisher_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->unique(
                ['workflow_template_id', 'version_number'],
                'wf_template_version_unique'
            );

            $table->index(
                ['workflow_template_id', 'status'],
                'wf_template_status_idx'
            );
        });

        // =========================================================
        // 3. WORKFLOW TEMPLATE STEPS
        // =========================================================

        Schema::create('workflow_template_steps', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_template_version_id');

            $table->foreign('workflow_template_version_id', 'wf_tsteps_version_fk')
                ->references('id')
                ->on('workflow_template_versions')
                ->cascadeOnDelete();

            $table->string('key');
            $table->unsignedInteger('sequence');
            $table->string('group_key')->default('default');
            $table->string('mode');
            $table->string('completion_rule');
            $table->unsignedInteger('quorum')->nullable();
            $table->json('approver_rule');

            $table->timestamps();

            $table->unique(
                ['workflow_template_version_id', 'key'],
                'wf_template_step_key_uq'
            );

            $table->index(
                ['workflow_template_version_id', 'sequence', 'group_key'],
                'template_steps_order_idx'
            );
        });

        // =========================================================
        // 4. WORKFLOW INSTANCES
        // =========================================================

        Schema::create('workflow_instances', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_template_version_id');

            $table->foreign('workflow_template_version_id', 'wf_instances_version_fk')
                ->references('id')
                ->on('workflow_template_versions')
                ->restrictOnDelete();

            $table->foreignUuid('initiator_user_id');

            $table->foreign('initiator_user_id', 'wf_instances_initiator_fk')
                ->references('id')
                ->on('users')
                ->restrictOnDelete();

            // Shortened so the composite unique index stays under
            // InnoDB's 3072-byte key limit (utf8mb4 = 4 bytes/char).
            $table->string('resource_type', 100);
            $table->string('resource_id', 100);
            $table->string('status')->default('pending_approval');
            $table->string('idempotency_key', 100);

            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->timestamps();

            $table->unique(
                [
                    'initiator_user_id',
                    'resource_type',
                    'resource_id',
                    'idempotency_key',
                ],
                'workflow_start_idempotency_unique'
            );

            $table->index(
                ['status', 'created_at'],
                'wf_instances_status_idx'
            );

            $table->index(
                ['resource_type', 'resource_id'],
                'wf_instances_resource_idx'
            );

            $table->index(
                ['initiator_user_id', 'created_at'],
                'wf_instances_initiator_idx'
            );
        });

        // =========================================================
        // 5. WORKFLOW STEPS
        // =========================================================

        Schema::create('workflow_steps', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_instance_id');

            $table->foreign('workflow_instance_id', 'wf_steps_instance_fk')
                ->references('id')
                ->on('workflow_instances')
                ->cascadeOnDelete();

            $table->foreignUuid('workflow_template_step_id');

            $table->foreign('workflow_template_step_id', 'wf_steps_template_step_fk')
                ->references('id')
                ->on('workflow_template_steps')
                ->restrictOnDelete();

            $table->string('key');
            $table->unsignedInteger('sequence');
            $table->string('group_key');
            $table->string('mode');
            $table->string('completion_rule');
            $table->unsignedInteger('quorum')->nullable();

            $table->string('status')->default('queued');
            $table->json('approver_rule');

            $table->timestamp('activated_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->timestamps();

            $table->unique(
                ['workflow_instance_id', 'key'],
                'wf_step_instance_key_uq'
            );

            $table->index(
                ['workflow_instance_id', 'sequence', 'status'],
                'workflow_steps_execution_idx'
            );
        });

        // =========================================================
        // 6. APPROVAL ASSIGNMENTS
        // =========================================================

        Schema::create('approval_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_step_id');

            $table->foreign('workflow_step_id', 'approval_assign_step_fk')
                ->references('id')
                ->on('workflow_steps')
                ->cascadeOnDelete();

            $table->foreignUuid('approver_user_id');

            $table->foreign('approver_user_id', 'approval_assign_approver_fk')
                ->references('id')
                ->on('users')
                ->restrictOnDelete();

            $table->unsignedInteger('sequence_order')->default(1);

            $table->string('source_type');
            $table->string('source_id')->nullable();
            $table->string('status')->default('pending');

            $table->timestamp('activated_at')->nullable();
            $table->timestamp('resolved_at')->nullable();

            $table->timestamps();

            $table->unique(
                ['workflow_step_id', 'approver_user_id'],
                'approval_step_approver_uq'
            );

            $table->unique(
                ['workflow_step_id', 'sequence_order'],
                'approval_step_sequence_uq'
            );

            $table->index(
                ['approver_user_id', 'status', 'created_at'],
                'approver_inbox_idx'
            );
        });

        // =========================================================
        // 7. APPROVAL ACTIONS
        // =========================================================

        Schema::create('approval_actions', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_instance_id');

            $table->foreign('workflow_instance_id', 'approval_actions_instance_fk')
                ->references('id')
                ->on('workflow_instances')
                ->restrictOnDelete();

            $table->foreignUuid('workflow_step_id');

            $table->foreign('workflow_step_id', 'approval_actions_step_fk')
                ->references('id')
                ->on('workflow_steps')
                ->restrictOnDelete();

            $table->foreignUuid('assignment_id');

            $table->foreign('assignment_id', 'approval_actions_assignment_fk')
                ->references('id')
                ->on('approval_assignments')
                ->restrictOnDelete();

            $table->foreignUuid('actor_user_id');

            $table->foreign('actor_user_id', 'approval_actions_actor_fk')
                ->references('id')
                ->on('users')
                ->restrictOnDelete();

            $table->string('action');
            $table->text('comment')->nullable();
            $table->string('idempotency_key');
            $table->dateTime('occurred_at');

            $table->timestamps();

            $table->unique(
                ['actor_user_id', 'idempotency_key'],
                'approval_actions_idempotency_uq'
            );

            $table->index(
                ['workflow_instance_id', 'occurred_at', 'id'],
                'approval_actions_history_idx'
            );

            $table->index(
                ['actor_user_id', 'occurred_at'],
                'approval_actions_actor_idx'
            );
        });

        // =========================================================
        // 8. WORKFLOW EVENTS
        // =========================================================

        Schema::create('workflow_events', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('workflow_instance_id');

            $table->foreign('workflow_instance_id', 'wf_events_instance_fk')
                ->references('id')
                ->on('workflow_instances')
                ->restrictOnDelete();

            $table->foreignUuid('actor_user_id')->nullable();

            $table->foreign('actor_user_id', 'wf_events_actor_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();

            $table->string('event_type');
            $table->string('from_status')->nullable();
            $table->string('to_status')->nullable();

            $table->json('data')->nullable();

            $table->uuid('correlation_id')->nullable();
            $table->string('idempotency_key')->nullable();

            $table->dateTime('occurred_at');

            $table->timestamps();

            $table->index(
                ['workflow_instance_id', 'occurred_at', 'id'],
                'wf_event_history_idx'
            );

            $table->unique(
                ['workflow_instance_id', 'idempotency_key'],
                'wf_event_idempotency_uq'
            );
        });

        // =========================================================
        // 9. DELEGATIONS
        // =========================================================

        Schema::create('delegations', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('delegator_user_id');

            $table->foreign('delegator_user_id', 'delegations_delegator_fk')
                ->references('id')
                ->on('users')
                ->restrictOnDelete();

            $table->foreignUuid('delegate_user_id');

            $table->foreign('delegate_user_id', 'delegations_delegate_fk')
                ->references('id')
                ->on('users')
                ->restrictOnDelete();

            $table->foreignUuid('approval_assignment_id')->nullable();

            $table->foreign('approval_assignment_id', 'delegations_assignment_fk')
                ->references('id')
                ->on('approval_assignments')
                ->cascadeOnDelete();

            $table->foreignUuid('role_id')->nullable();

            $table->foreign('role_id', 'delegations_role_fk')
                ->references('id')
                ->on('roles')
                ->restrictOnDelete();

            $table->dateTime('starts_at');
            $table->dateTime('ends_at');

            $table->foreignUuid('created_by');

            $table->foreign('created_by', 'delegations_creator_fk')
                ->references('id')
                ->on('users')
                ->restrictOnDelete();

            $table->timestamps();

            $table->index(
                ['delegator_user_id', 'starts_at', 'ends_at'],
                'delegations_delegator_idx'
            );

            $table->index(
                ['delegate_user_id', 'starts_at', 'ends_at'],
                'delegations_delegate_idx'
            );
        });

        // =========================================================
        // 10. NOTIFICATION DELIVERIES
        // =========================================================

        Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('notification_id');

            $table->foreign('notification_id', 'notification_deliveries_notification_fk')
                ->references('id')
                ->on('notifications')
                ->cascadeOnDelete();

            $table->string('channel');
            $table->string('status')->default('pending');

            $table->string('idempotency_key')
                ->unique('notification_deliveries_idempotency_uq');

            $table->unsignedInteger('attempts')->default(0);

            $table->timestamp('next_attempt_at')->nullable();
            $table->timestamp('delivered_at')->nullable();

            $table->timestamps();

            $table->index(
                ['status', 'next_attempt_at'],
                'notification_deliveries_status_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_deliveries');
        Schema::dropIfExists('delegations');
        Schema::dropIfExists('workflow_events');
        Schema::dropIfExists('approval_actions');
        Schema::dropIfExists('approval_assignments');
        Schema::dropIfExists('workflow_steps');
        Schema::dropIfExists('workflow_instances');
        Schema::dropIfExists('workflow_template_steps');
        Schema::dropIfExists('workflow_template_versions');
        Schema::dropIfExists('workflow_templates');
    }
};