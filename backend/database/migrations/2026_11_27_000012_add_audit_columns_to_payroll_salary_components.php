<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the audit columns to payroll_salary_components (BRD §7.5).
     *
     * PayrollComponentController writes created_by on store and
     * updated_by on update, but migration 000009 created the table
     * without either column, so every component create and update
     * 500s with "SQLSTATE[42S22]: Unknown column 'updated_by' in
     * 'field list'" (27 Nov 2026, component id 4). The sibling tables
     * already carry both columns (payroll_salary_structures in 000009,
     * payroll_runs in 000010) — this brings the components table in
     * line. Both are nullable UUIDs, matching the existing style
     * (users.id is a UUID in this codebase).
     *
     * The hasColumn guards make the migration safe to re-run if a
     * deploy dies between the two adds (MySQL DDL is not
     * transactional, same failure mode as the 24 Nov partial state).
     */
    public function up(): void
    {
        Schema::table('payroll_salary_components', function (Blueprint $table) {
            if (! Schema::hasColumn('payroll_salary_components', 'created_by')) {
                $table->uuid('created_by')->nullable()->index()->after('effective_to');
            }
            if (! Schema::hasColumn('payroll_salary_components', 'updated_by')) {
                $table->uuid('updated_by')->nullable()->index()->after('created_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payroll_salary_components', function (Blueprint $table) {
            $table->dropColumn(['created_by', 'updated_by']);
        });
    }
};
