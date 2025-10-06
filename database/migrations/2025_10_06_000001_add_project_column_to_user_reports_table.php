<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            if (!Schema::hasColumn('user_reports', 'project')) {
                $table->string('project')->nullable()->after('user_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            if (Schema::hasColumn('user_reports', 'project')) {
                $table->dropColumn('project');
            }
        });
    }
};
