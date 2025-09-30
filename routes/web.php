<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\EditorController;
use App\Http\Controllers\AboutUsController;
use App\Http\Controllers\AudioProjectController;
use App\Http\Controllers\FormatChangerController;
use App\Http\Controllers\UserReportController;
use App\Http\Controllers\AdminController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect()->route('login');
});

Route::middleware(['auth', 'verified'])->group(function () {
    // -.- Media Projects -.-
    Route::get('/dashboard', [ProjectController::class, 'index'])->name('dashboard');
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
    Route::put('/projects/{project}', [ProjectController::class, 'update'])->name('projects.update');
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('projects.destroy');
    Route::get('/editor/{project}', [EditorController::class, 'show'])->name('editor');

    // -.- Audio Projects -.-
    Route::get('/audio-projects', [AudioProjectController::class, 'index'])->name('audio.projects');
    Route::post('/audio-projects', [AudioProjectController::class, 'store'])->name('audio.projects.store');
    Route::put('/audio-projects/{audioProject}', [AudioProjectController::class, 'update'])->name('audio.projects.update');
    Route::delete('/audio-projects/{audioProject}', [AudioProjectController::class, 'destroy'])->name('audio.projects.destroy');
    Route::get('/audio-editor/{audioProject}', [AudioProjectController::class, 'show'])->name('audio.editor');

    // -.- User Profile -.-
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    // -.- About Us -.-
    Route::get('/about-us', [AboutUsController::class, 'index'])->name('about.us');

    // -.- Format Changer -.-
    Route::get('/format-changer', [FormatChangerController::class, 'index'])->name('format.changer');

    // -.- User Reports -.-
    Route::get('/report-issue', [UserReportController::class, 'create'])->name('reports.create');
    Route::post('/report-issue', [UserReportController::class, 'store'])->name('reports.store');

    // -.- Admin Panel (admin-only) -.-
    Route::middleware('admin')->group(function () {
    Route::get('/admin', [AdminController::class, 'index'])->name('admin.index');
    Route::delete('/admin/reports/bulk', [AdminController::class, 'destroyMany'])
        ->name('admin.reports.bulkDelete');
    });


        
});

require __DIR__.'/auth.php';
