<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Inertia\Inertia;

class EditorController extends Controller
{
    public function show(Project $project)
    {
        // For now, just render the project without authorization
        return Inertia::render('Editor', [
            'project' => $project
        ]);
    }
}

