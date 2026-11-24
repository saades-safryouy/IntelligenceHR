<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Payroll run tables (BRD §7.6, §7.7): runs, payslips (with the
     * calculation snapshot) and versioned client configuration. The
     * run lifecycle API lands in P3; these are tables + models only.
     *
     * The "one open run per period per scope" rule (FR-20) is enforced
     * in the run service in P3, not by a DB constraint — a rectifying
     * run shares the period + scope of the run it corrects.
     */
    public function up(): void
    {
        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->string('jurisdiction_code')->nullable();
            $table->string('jurisdiction_profile_version')->nullable();
            $table->integer('client_config_version')->nullable();
            $table->integer('component_catalog_version')->nullable();
            $table->integer('period_year');
            $table->integer('period_month');
            $table->date('period_start');
            $table->date('period_end');
            $table->string('scope_type')->default('all'); // all | department | site
            $table->string('scope_id')->nullable();
            $table->string('status')->default('draft'); // draft | validated | approved | closed
            $table->string('type')->default('normal'); // normal | rectifying
            $table->json('totals')->nullable();
            $table->uuid('created_by')->nullable()->index();
            $table->uuid('updated_by')->nullable()->index();
            $table->timestamps();
            $table->index(['tenant_id', 'period_year', 'period_month']);
        });

        Schema::create('payroll_payslips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->foreignId('payroll_run_id')->constrained('payroll_runs')->cascadeOnDelete();
            $table->unsignedBigInteger('employee_id')->index();
            $table->integer('period_year');
            $table->integer('period_month');
            $table->json('calculation_json');
            $table->string('pdf_path')->nullable();
            $table->timestamps();
            $table->unique(['payroll_run_id', 'employee_id']);
        });

        Schema::create('payroll_client_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->integer('version');
            $table->json('settings_json');
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->uuid('created_by')->nullable()->index();
            $table->timestamps();
            $table->unique(['tenant_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_client_configs');
        Schema::dropIfExists('payroll_payslips');
        Schema::dropIfExists('payroll_runs');
    }
};
