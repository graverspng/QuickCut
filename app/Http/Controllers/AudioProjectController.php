<?php

namespace App\Http\Controllers;

use App\Models\AudioProject;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests; 

class AudioProjectController extends Controller
{
    use AuthorizesRequests; 

    public function index()
    {
        $projects = AudioProject::where('user_id', auth()->id())->get();

        return Inertia::render('AudioDashboard', [
            'projects' => $projects,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        AudioProject::create([
            'user_id' => auth()->id(),
            'name' => $request->name,
            'description' => $request->description,
            'tracks' => [],
        ]);

        return redirect()->route('audio.projects');
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

        $audioProject->update([
            'name' => $request->name,
            'description' => $request->description,
            'tracks' => $request->tracks,
        ]);

        return back()->with('success', 'Audio project updated successfully!');
    }

    public function destroy(AudioProject $audioProject)
    {
        $this->authorize('delete', $audioProject);

        $audioProject->delete();

        return redirect()->route('audio.projects');
    }
}
