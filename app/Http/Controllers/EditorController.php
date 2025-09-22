<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Inertia\Inertia;

class EditorController extends Controller
{
    public function show(Project $project)
    {
        if ($project->user_id !== auth()->id()) {
            abort(403);
        }
    
        return Inertia::render('Editor', [
            'project' => $project,
        ]);
    }
    
}
