<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;

class ProjectController extends Controller
{
    public function index()
    {
        $projects = Project::where('user_id', auth()->id())
            ->select(['id', 'user_id', 'name', 'description', 'favorited_project', 'created_at', 'updated_at'])
            ->orderByDesc('favorited_project')
            ->orderByDesc('updated_at')
            ->orderBy('name')
            ->get();
        return Inertia::render('Dashboard', ['projects' => $projects]);
    }

    public function store(Request $request)
    {
        $request->validate(['name' => 'required|string|max:20']);

        $project = Project::create([
            'user_id'       => auth()->id(),
            'name'          => $request->name,
            'favorited_project' => false,
            'media_files'   => [],
            'clips'         => [],
            'music_tracks'  => [],
            'effects'       => [],
            'text_overlays' => [],
            'transitions'   => [],
        ]);

        return redirect()->route('editor', ['project' => $project->id]);
    }

    public function update(Request $request, Project $project)
    {
        Gate::authorize('update', $project);

        $validated = $request->validate([
            'name'          => 'sometimes|string|max:20',
            'description'   => 'sometimes|nullable|string',
            'favorited_project' => 'sometimes|boolean',
            'media_files'   => 'sometimes|array',
            'clips'         => 'sometimes|array',
            'music_tracks'  => 'sometimes|array',
            'effects'       => 'sometimes|array',
            'text_overlays' => 'sometimes|array',
            'transitions'   => 'sometimes|array',
        ]);

        $payload = [];
        foreach (['name','description','favorited_project','media_files','clips','music_tracks','effects','text_overlays','transitions'] as $f) {
            if (array_key_exists($f, $validated)) $payload[$f] = $validated[$f];
        }

        $project->update($payload);

        return back()->with('success', 'Project saved successfully!');
    }

    public function destroy(Project $project)
    {
        Gate::authorize('delete', $project);
        $project->delete();
        return redirect()->route('dashboard');
    }


    public function uploadMedia(Request $request, Project $project)
    {
        Gate::authorize('update', $project);

        $request->validate([
            'files'   => 'required|array|min:1|max:10',
            'files.*' => [
                'required',
                File::types([
                    'mp4','mov','m4v','webm','ogv',
                    'mp3','wav','aac','m4a','flac','ogg',
                    'jpg','jpeg','png','webp','gif','tiff'
                ])->min(10)
                  ->max(1024*1024)
            ],
        ]);

        $disk = 'public';
        $dir  = "projects/{$project->id}/media";


        if (!Storage::disk($disk)->exists($dir)) {
            Storage::disk($disk)->makeDirectory($dir);
        }

        $assets = [];
        foreach ($request->file('files', []) as $file) {
            $name = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
            $ext  = strtolower($file->getClientOriginalExtension());
            $safe = str()->slug($name) . '-' . uniqid() . '.' . $ext;


            $path = $file->storeAs($dir, $safe, $disk);


            $mime = $file->getClientMimeType();
            $kind = str_starts_with($mime, 'video/') ? 'video'
                  : (str_starts_with($mime, 'audio/') ? 'audio' : 'image');

            $assets[] = [
                'id'   => md5($path), 
                'name' => $file->getClientOriginalName(),
                'path' => $path,
                'url'  => Storage::disk($disk)->url($path),
                'mime' => $mime,
                'kind' => $kind,
                'size' => $file->getSize(),
            ];
        }

        return response()->json(['assets' => $assets], 201);
    }
}
