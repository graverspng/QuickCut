<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\EditorController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Redirect root "/" to login
Route::get('/', function () {
    return redirect()->route('login');
});

// Authenticated routes
Route::middleware(['auth', 'verified'])->group(function () {
    // Dashboard - shows projects
    Route::get('/dashboard', [ProjectController::class, 'index'])->name('dashboard');

    // Create new project
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');

    // Editor page for a specific project
    Route::get('/editor/{project}', [EditorController::class, 'show'])->name('editor');

    // Profile routes
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

// Auth routes (login, register, password reset, etc.)
require __DIR__.'/auth.php';
