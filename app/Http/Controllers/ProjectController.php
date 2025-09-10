<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests; // 👈 add this

class ProjectController extends Controller
{
    use AuthorizesRequests; // 👈 add this

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
        ]);

        return redirect()->route('editor', ['project' => $project->id]);
    }

    public function update(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $project->update([
            'media_files'  => $request->media_files,
            'clips'        => $request->clips,
            'music_tracks' => $request->music_tracks,
        ]);

        return back()->with('success', 'Project saved successfully!');
    }

    public function destroy(Project $project)
{
    $this->authorize('delete', $project);

    $project->delete();

    return redirect()->route('dashboard');
}

}
