<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ProjectController extends Controller
{
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
        ]);
    
        // Redirect to editor page
        return redirect()->route('editor', ['project' => $project->id]);
    }
    
}
