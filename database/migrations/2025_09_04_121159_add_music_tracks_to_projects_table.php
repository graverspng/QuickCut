<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('projects', 'music_tracks')) {
            Schema::table('projects', function (Blueprint $table) {
                if (Schema::hasColumn('projects', 'clips')) {
                    $table->json('music_tracks')->nullable()->after('clips');
                } else {
                    $table->json('music_tracks')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('projects', 'music_tracks')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->dropColumn('music_tracks');
            });
        }
    }
};
