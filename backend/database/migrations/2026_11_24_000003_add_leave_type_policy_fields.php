<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->integer('default_entitlement_days')->default(0);
            $table->integer('carry_over_days')->default(0);
            $table->boolean('requires_approval')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->dropColumn(['default_entitlement_days', 'carry_over_days', 'requires_approval']);
        });
    }
};
