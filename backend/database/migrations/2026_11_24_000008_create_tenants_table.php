<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tenancy foundation (Payroll P1, BRD §2.6): creates the tenants
     * table, the "Demo Company" seed tenant (decision D-12) holding all
     * existing data, and adds tenant_id (+ platform_admin on users,
     * + CNSS fields on employees) to the existing core tables,
     * backfilled with the seed tenant.
     *
     * Columns stay NULLABLE in P1 (NOT NULL follows once every writer
     * assigns tenant_id); the tenancy layer enforces the tenant at the
     * application level (BelongsToTenant + ResolveTenant). Foreign keys
     * are deliberately NOT added on the altered live tables, matching
     * the repo's dominant convention (hr_core relations are plain
     * indexed columns); new payroll tables do carry FK constraints.
     */
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('status')->default('active'); // active | suspended | trial
            $table->string('default_jurisdiction')->nullable();
            $table->string('default_currency')->default('MAD');
            $table->json('default_languages')->nullable();
            $table->uuid('created_by')->nullable()->index();
            $table->timestamps();
        });

        $seedId = $this->seedTenantId();

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
            $table->boolean('platform_admin')->default(false);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
            $table->string('cnss_number')->nullable();
            $table->boolean('spouse_dependent')->default(false);
            $table->unsignedInteger('dependants_count')->default(0);
            $table->unique(['tenant_id', 'cnss_number']);
        });

        Schema::table('departments', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
        });

        // Backfill: every existing row belongs to the seed tenant (§2.6).
        DB::table('users')->whereNull('tenant_id')->update(['tenant_id' => $seedId]);
        DB::table('employees')->whereNull('tenant_id')->update(['tenant_id' => $seedId]);
        DB::table('departments')->whereNull('tenant_id')->update(['tenant_id' => $seedId]);
        DB::table('audit_logs')->whereNull('tenant_id')->update(['tenant_id' => $seedId]);
    }

    private function seedTenantId(): int
    {
        $existing = DB::table('tenants')->where('slug', 'demo-company')->first();
        if ($existing) {
            return (int) $existing->id;
        }

        return (int) DB::table('tenants')->insertGetId([
            'name' => 'Demo Company',
            'slug' => 'demo-company',
            'status' => 'active',
            'default_jurisdiction' => 'MA',
            'default_currency' => 'MAD',
            'default_languages' => json_encode(['fr', 'ar']),
            'created_by' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn('tenant_id');
        });
        Schema::table('departments', function (Blueprint $table) {
            $table->dropColumn('tenant_id');
        });
        Schema::table('employees', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'cnss_number']);
            $table->dropColumn(['tenant_id', 'cnss_number', 'spouse_dependent', 'dependants_count']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['tenant_id', 'platform_admin']);
        });
        Schema::dropIfExists('tenants');
    }
};
