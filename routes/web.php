<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\EditorController;
use App\Http\Controllers\AboutUsController;
use App\Http\Controllers\AudioProjectController;
use App\Http\Controllers\FormatChangerController;
use App\Http\Controllers\UserReportController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\ProjectExportController;
use App\Http\Controllers\AudioProjectExportController;
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
    Route::post('/projects/{project}/media', [ProjectController::class, 'uploadMedia'])->name('projects.media.upload');
    Route::get('/editor/{project}', [EditorController::class, 'show'])->name('editor');
    Route::get('/projects/{project}/export', [ProjectExportController::class, 'show'])->name('projects.export');
    Route::get('/projects/{project}/export/download', [ProjectExportController::class, 'download'])->name('projects.export.download');
    Route::post('/projects/{project}/export/queue', [ProjectExportController::class, 'queue'])->name('projects.export.queue');
    Route::get('/projects/{project}/export/renders/{render}', [ProjectExportController::class, 'jobStatus'])->name('projects.export.render.status');
    Route::get('/projects/{project}/export/renders/{render}/download', [ProjectExportController::class, 'jobDownload'])->name('projects.export.render.download');

    // -.- Audio Projects -.-
    Route::get('/audio-projects', [AudioProjectController::class, 'index'])->name('audio.projects');
    Route::post('/audio-projects', [AudioProjectController::class, 'store'])->name('audio.projects.store');
    Route::put('/audio-projects/{audioProject}', [AudioProjectController::class, 'update'])->name('audio.projects.update');
    Route::delete('/audio-projects/{audioProject}', [AudioProjectController::class, 'destroy'])->name('audio.projects.destroy');
    Route::get('/audio-editor/{audioProject}', [AudioProjectController::class, 'show'])->name('audio.editor');
    Route::get('/audio-projects/{audioProject}/export', [AudioProjectExportController::class, 'showExport'])->name('audio.projects.export');
    Route::get('/audio-projects/{audioProject}/export/download', [AudioProjectExportController::class, 'downloadExport'])->name('audio.projects.export.download');
    Route::post('/audio-projects/{audioProject}/export/queue', [AudioProjectExportController::class, 'queueAudio'])->name('audio.projects.export.queue');
    Route::get('/audio-projects/{audioProject}/export/renders/{audioRender}', [AudioProjectExportController::class, 'jobStatusAudio'])->name('audio.projects.export.render.status');
    Route::get('/audio-projects/{audioProject}/export/renders/{audioRender}/download', [AudioProjectExportController::class, 'jobDownloadAudio'])->name('audio.projects.export.render.download');
    Route::post('/audio-projects/{audioProject}/media', [AudioProjectController::class, 'uploadMedia'])->name('audio.projects.media.upload');

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
