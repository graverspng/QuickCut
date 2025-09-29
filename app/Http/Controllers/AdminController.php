<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class AdminController extends Controller
{
    /**
     * Display the admin panel.
     */
    public function index(): Response
    {
        return Inertia::render('Admin/Index');
    }
}
