<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Payroll foundation tables (BRD §7.2, §7.4, §7.5, §7.3): profile
     * enablement per tenant, effective-dated legal parameters (shared
     * across tenants — no tenant_id), the tenant's component catalog
     * and salary structures (+ structure lines).
     *
     * No rates are seeded here. Parameters are seeded by the Morocco
     * profile in P2, after legal validation (§12). Enum-like columns
     * are plain strings with a comment, matching the repo's existing
     * convention (e.g. jobs.status). created_by / updated_by are UUIDs
     * because users.id is a UUID in this codebase (the BRD's "bigint"
     * is adapted here — see the P1 report).
     */
    public function up(): void
    {
        Schema::create('tenant_jurisdictions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->string('jurisdiction_code');
            $table->string('profile_version');
            $table->string('status')->default('disabled'); // enabled | disabled
            $table->dateTime('enabled_at')->nullable();
            $table->dateTime('disabled_at')->nullable();
            $table->uuid('enabled_by')->nullable()->index();
            $table->timestamps();
            $table->unique(['tenant_id', 'jurisdiction_code']);
        });

        Schema::create('payroll_legal_parameters', function (Blueprint $table) {
            $table->id();
            $table->string('jurisdiction_code')->index();
            $table->string('profile_version');
            $table->string('key');
            $table->decimal('value', 14, 4);
            $table->string('value_type'); // rate | amount | integer
            $table->date('valid_from');
            $table->date('valid_to')->nullable();
            $table->string('source');
            $table->string('confidence'); // confirmed | corroborated | secondary
            $table->string('source_url')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('created_by')->nullable()->index();
            $table->timestamps();
            $table->unique(['jurisdiction_code', 'profile_version', 'key', 'valid_from']);
        });

        Schema::create('payroll_salary_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->string('code');
            $table->string('name_fr')->nullable();
            $table->string('name_ar')->nullable();
            $table->string('name_en')->nullable();
            $table->string('category'); // earning | allowance | benefit_in_kind | bonus | deduction
            $table->boolean('cnss_subject')->default(true);
            $table->boolean('ir_subject')->default(true);
            $table->string('cap_type')->default('none'); // none | fixed_period | fixed_year | pct_base | smig_multiple | per_km | per_day
            $table->decimal('cap_value', 12, 4)->nullable();
            $table->boolean('counts_toward_tax_abatement')->default(false);
            $table->boolean('is_system')->default(false);
            $table->string('suggested_by_profile')->nullable();
            $table->boolean('active')->default(true);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'code']);
        });

        Schema::create('payroll_salary_structures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->unsignedBigInteger('employee_id')->index();
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->decimal('base_salary', 12, 2);
            $table->integer('contractual_hours_month')->default(191);
            $table->string('employment_type')->default('Full-time');
            $table->text('notes')->nullable();
            $table->uuid('created_by')->nullable()->index();
            $table->uuid('updated_by')->nullable()->index();
            $table->timestamps();
            $table->index(['employee_id', 'effective_from']);
        });

        Schema::create('payroll_structure_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants');
            $table->foreignId('salary_structure_id')->constrained('payroll_salary_structures')->cascadeOnDelete();
            $table->foreignId('component_id')->nullable()->constrained('payroll_salary_components')->nullOnDelete();
            $table->string('component_code')->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_structure_lines');
        Schema::dropIfExists('payroll_salary_structures');
        Schema::dropIfExists('payroll_salary_components');
        Schema::dropIfExists('payroll_legal_parameters');
        Schema::dropIfExists('tenant_jurisdictions');
    }
};
