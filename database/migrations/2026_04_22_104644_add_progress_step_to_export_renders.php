<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('export_renders', function (Blueprint $table) {
            $table->string('progress_step', 500)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('export_renders', function (Blueprint $table) {
            $table->dropColumn('progress_step');
        });
    }
};
