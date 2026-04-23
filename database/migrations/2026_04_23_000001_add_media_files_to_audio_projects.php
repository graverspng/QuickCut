<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audio_projects', function (Blueprint $table) {
            $table->json('media_files')->nullable()->after('tracks');
        });
    }

    public function down(): void
    {
        Schema::table('audio_projects', function (Blueprint $table) {
            $table->dropColumn('media_files');
        });
    }
};
