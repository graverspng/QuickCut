<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AudioProject extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'description',
        'favorited_project',
        'tracks',
        'media_files',
    ];

    protected $casts = [
        'tracks'            => 'array',
        'media_files'       => 'array',
        'favorited_project' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
