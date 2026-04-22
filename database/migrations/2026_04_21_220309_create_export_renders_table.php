<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('export_renders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status', 20)->default('pending'); // pending | processing | done | failed
            $table->string('output_path', 1000)->nullable();
            $table->text('error_message')->nullable();
            $table->string('error_code', 60)->nullable();
            $table->timestamps();

            $table->index(['project_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_renders');
    }
};
