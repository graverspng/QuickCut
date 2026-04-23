<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_export_renders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('audio_project_id');
            $table->unsignedBigInteger('user_id');
            $table->string('status', 20)->default('pending'); // pending | processing | done | failed
            $table->string('progress_step', 500)->nullable();
            $table->string('output_path', 1000)->nullable();
            $table->text('error_message')->nullable();
            $table->string('error_code', 60)->nullable();
            $table->timestamps();

            $table->index(['audio_project_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_export_renders');
    }
};
