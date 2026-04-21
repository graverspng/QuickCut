<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Export extends Model
{
    use HasFactory;

    protected $table = 'exports';

    protected $fillable = [
        'uuid',
        'project_id',
        'user_id',
        'status',
        'file_name',
        'file_path',
        'file_size',
        'error_message',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];
}
