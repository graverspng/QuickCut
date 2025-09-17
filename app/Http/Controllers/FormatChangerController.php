<?php

namespace App\Http\Controllers;

use Inertia\Inertia;

class FormatChangerController extends Controller
{
    public function index()
    {
        return Inertia::render('FormatChanger');
    }
}
