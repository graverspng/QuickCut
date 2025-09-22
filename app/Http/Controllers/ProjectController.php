<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class ProjectController extends Controller
{
    use AuthorizesRequests;

    public function index()
    {
        $projects = Project::where('user_id', auth()->id())->get();
        return Inertia::render('Dashboard', [
            'projects' => $projects
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $project = Project::create([
            'user_id' => auth()->id(),
            'name' => $request->name,
            'media_files' => [],
            'clips' => [],
            'music_tracks' => [],
            'effects' => [],
        ]);

        return redirect()->route('editor', ['project' => $project->id]);
    }

    public function update(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'media_files' => 'sometimes|array',
            'clips' => 'sometimes|array',
            'music_tracks' => 'sometimes|array',
            'effects' => 'sometimes|array',
        ]);

        $payload = [];

        foreach (['name', 'media_files', 'clips', 'music_tracks', 'effects'] as $field) {
            if (array_key_exists($field, $validated)) {
                $payload[$field] = $validated[$field];
            }
        }

        if (array_key_exists('description', $validated)) {
            $payload['description'] = $validated['description'];
        }

        $project->update($payload);


        return back()->with('success', 'Project saved successfully!');
    }

    public function destroy(Project $project)
{
    $this->authorize('delete', $project);

    $project->delete();

    return redirect()->route('dashboard');
}

}
