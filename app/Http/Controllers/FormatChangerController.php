<?php

namespace App\Http\Controllers;

use Inertia\Inertia;

class FormatChangerController extends Controller
{
    /**
     * Display the format changer landing page.
     */
    public function index()
    {
        return Inertia::render('FormatChanger');
    }
}