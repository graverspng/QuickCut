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
        'music_tracks', // added
        'is_premium'
    ];

    protected $casts = [
        'media_files' => 'array',
        'clips' => 'array',
        'music_tracks' => 'array', // added
        'is_premium' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
