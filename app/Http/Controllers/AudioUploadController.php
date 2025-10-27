<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AudioUploadController extends Controller
{
    use AuthorizesRequests;

    public function store(Request $request)
    {
        $this->authorize('create', \App\Models\AudioProject::class);

        $request->validate([
            'audio' => 'required|file|mimetypes:audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac,audio/mp4|max:51200',
        ]);

        $path = $request->file('audio')->store('audio', 'public');

        return response()->json([
            'storageKey' => $path,
            'url' => Storage::disk('public')->url($path),
            'name' => $request->file('audio')->getClientOriginalName(),
        ]);
    }
}
