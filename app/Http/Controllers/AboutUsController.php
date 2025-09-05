<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Illuminate\Http\Request;

class AboutUsController extends Controller
{
    public function index()
    {
        return Inertia::render('AboutUs');
    }
}
