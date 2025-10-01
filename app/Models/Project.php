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
        'description',
        'favorited_project',
        'media_files',
        'clips',
        'music_tracks',
        'effects',
        'text_overlays',
        'transitions',
    ];

    protected $casts = [
        'media_files'   => 'array',
        'clips'         => 'array',
        'music_tracks'  => 'array',
        'effects'       => 'array',
        'text_overlays' => 'array',
        'transitions'   => 'array',
        'favorited_project' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
