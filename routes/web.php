<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\EditorController;
use App\Http\Controllers\AboutUsController;
use App\Http\Controllers\AudioProjectController;
use App\Http\Controllers\FormatChangerController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return redirect()->route('login');
});

Route::middleware(['auth', 'verified'])->group(function () {
    // === MEDIJAS PROJEKTI ===
    Route::get('/dashboard', [ProjectController::class, 'index'])->name('dashboard');
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
    Route::put('/projects/{project}', [ProjectController::class, 'update'])->name('projects.update');
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('projects.destroy');
    Route::get('/editor/{project}', [EditorController::class, 'show'])->name('editor');

    // === AUDIO PROJEKTI ===   
    Route::get('/audio-projects', [AudioProjectController::class, 'index'])->name('audio.projects');
    Route::post('/audio-projects', [AudioProjectController::class, 'store'])->name('audio.projects.store');
    Route::put('/audio-projects/{audioProject}', [AudioProjectController::class, 'update'])->name('audio.projects.update');
    Route::delete('/audio-projects/{audioProject}', [AudioProjectController::class, 'destroy'])->name('audio.projects.destroy');

    // === USER PROFILE ===
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    // === ABOUT US ===
    Route::get('/about-us', [AboutUsController::class, 'index'])->name('about.us');
    Route::get('/audio-editor/{audioProject}', [AudioProjectController::class, 'show'])->name('audio.editor');
    Route::get('/format-changer', [FormatChangerController::class, 'index'])->name('format.changer');
    
    

});

require __DIR__.'/auth.php';
