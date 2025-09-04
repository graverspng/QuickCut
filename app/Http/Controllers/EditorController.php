<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Inertia\Inertia;

class EditorController extends Controller
{
    public function show(Project $project)
    {
        return Inertia::render('Editor', [
            'project' => $project,
        ]);
    }
}
