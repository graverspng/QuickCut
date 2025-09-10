<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'media_files',
        'clips',
        'music_tracks',
    ];

    protected $casts = [
        'media_files' => 'array',
        'clips' => 'array',
        'music_tracks' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
