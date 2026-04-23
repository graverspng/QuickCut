<?php

namespace App\Http\Controllers;

use App\Models\AudioProject;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AudioProjectController extends Controller
{
    use AuthorizesRequests;

    public function index()
    {
        $projects = AudioProject::where('user_id', auth()->id())
            ->select(['id', 'user_id', 'name', 'description', 'favorited_project', 'created_at', 'updated_at'])
            ->orderByDesc('favorited_project')
            ->orderByDesc('updated_at')
            ->orderBy('name')
            ->get();

        return Inertia::render('AudioDashboard', [
            'projects' => $projects,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:20',
        ]);

        $project = AudioProject::create([
            'user_id'     => auth()->id(),
            'name'        => $request->name,
            'description' => $request->description,
            'favorited_project' => false,
            'tracks'      => [],
            'media_files' => [],
        ]);

        return redirect()->route('audio.editor', $project);
    }

    public function show(AudioProject $audioProject)
    {
        $this->authorize('view', $audioProject);

        return Inertia::render('AudioEditor', [
            'project' => $audioProject,
        ]);
    }

    public function update(Request $request, AudioProject $audioProject)
    {
        $this->authorize('update', $audioProject);

        $validated = $request->validate([
            'name'               => 'sometimes|string|max:20',
            'description'        => 'sometimes|nullable|string',
            'tracks'             => 'sometimes|array',
            'media_files'        => 'sometimes|array',
            'favorited_project'  => 'sometimes|boolean',
        ]);

        $payload = [];
        foreach (['name', 'description', 'tracks', 'media_files', 'favorited_project'] as $field) {
            if (array_key_exists($field, $validated)) {
                $payload[$field] = $validated[$field];
            }
        }

        if ($payload) {
            $audioProject->update($payload);
        }

        return back()->with('success', 'Audio project saved.');
    }

    public function cleanupMedia(Request $request, AudioProject $audioProject)
    {
        $this->authorize('update', $audioProject);

        $storageKeys = array_filter((array) $request->input('storageKeys', []), 'is_string');
        $projectDir  = 'audio/projects/' . $audioProject->id . '/';

        foreach ($storageKeys as $key) {
            // Only allow deleting files inside this project's own directory
            if (!str_starts_with($key, $projectDir)) {
                continue;
            }
            Storage::disk('public')->delete($key);
        }

        // Remove cleaned-up files from the project's media_files array
        $mediaFiles = is_array($audioProject->media_files) ? $audioProject->media_files : [];
        $filtered   = array_values(array_filter(
            $mediaFiles,
            fn ($f) => !in_array($f['storageKey'] ?? '', $storageKeys, true)
        ));
        $audioProject->update(['media_files' => $filtered]);

        return response()->json(['ok' => true]);
    }

    public function destroy(AudioProject $audioProject)
    {
        $this->authorize('delete', $audioProject);

        $audioProject->delete();

        return redirect()->route('audio.projects');
    }

    public function uploadMedia(Request $request, AudioProject $audioProject)
    {
        $this->authorize('update', $audioProject);

        $request->validate([
            'file' => [
                'required',
                'file',
                // Accept by extension — browser MIME types vary wildly for audio
                'mimes:mp3,wav,ogg,flac,aac,m4a,webm,opus',
                // 300 MB in kilobytes
                'max:307200',
            ],
            'name' => 'sometimes|string|max:255',
        ]);

        $file = $request->file('file');
        $dir  = 'audio/projects/' . $audioProject->id;

        $basename    = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));
        $ext         = strtolower($file->getClientOriginalExtension());
        $storedName  = uniqid() . '_' . ($basename ?: 'track') . '.' . $ext;

        $path = $file->storeAs($dir, $storedName, 'public');

        $mediaEntry = [
            'id'          => Str::uuid()->toString(),
            'name'        => $request->input('name', $file->getClientOriginalName()),
            'storageKey'  => $path,
            'url'         => Storage::disk('public')->url($path),
            'type'        => 'audio',
            'sourceDuration' => 0,
            'duration'    => 0,
        ];

        // Persist the uploaded file into the project's media_files array
        $existing   = is_array($audioProject->media_files) ? $audioProject->media_files : [];
        $existing[] = $mediaEntry;
        $audioProject->update(['media_files' => $existing]);

        return response()->json([
            'id'          => $mediaEntry['id'],
            'name'        => $mediaEntry['name'],
            'storageKey'  => $path,
            'url'         => $mediaEntry['url'],
            'type'        => 'audio',
        ]);
    }
}
