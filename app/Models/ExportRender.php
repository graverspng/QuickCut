<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExportRender extends Model
{
    protected $table = 'export_renders';

    protected $fillable = [
        'project_id',
        'user_id',
        'status',
        'output_path',
        'error_message',
        'error_code',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
