<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('projects', 'transitions')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->json('transitions')->nullable()->after('effects');
            });
        }
    }
    public function down(): void
    {
        if (Schema::hasColumn('projects', 'transitions')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->dropColumn('transitions');
            });
        }
    }
};