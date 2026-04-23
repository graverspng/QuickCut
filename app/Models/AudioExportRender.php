<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AudioExportRender extends Model
{
    protected $table = 'audio_export_renders';

    protected $fillable = [
        'audio_project_id',
        'user_id',
        'status',
        'progress_step',
        'output_path',
        'error_message',
        'error_code',
    ];
}
