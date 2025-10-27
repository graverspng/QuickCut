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
            'user_id' => auth()->id(),
            'name' => $request->name,
            'description' => $request->description,
            'favorited_project' => false,
            'tracks' => [],
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
            'name' => 'sometimes|string|max:20',
            'description' => 'sometimes|nullable|string',
            'tracks' => 'sometimes|array',
            'favorited_project' => 'sometimes|boolean',
        ]);

        $payload = [];
        foreach (['name', 'description', 'tracks', 'favorited_project'] as $field) {
            if (array_key_exists($field, $validated)) {
                $payload[$field] = $validated[$field];
            }
        }

        if ($payload) {
            $audioProject->update($payload);
        }

        return back()->with('success', 'Audio project updated successfully!');
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
            'file' => 'required|file|mimetypes:audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/x-m4a',
            'name' => 'sometimes|string|max:200',
        ]);

        $file = $request->file('file');
        $dir = 'audio/projects/' . $audioProject->id;

        $basename = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));
        $ext = strtolower($file->getClientOriginalExtension());
        $storedName = uniqid() . '_' . ($basename ?: 'track') . '.' . $ext;

        $path = $file->storeAs($dir, $storedName, 'public');

        return response()->json([
            'storageKey' => $path,
            'url' => Storage::disk('public')->url($path),
            'name' => $request->input('name', $file->getClientOriginalName()),
            'type' => 'audio',
        ]);
    }
}
