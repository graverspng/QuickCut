<?php

namespace App\Providers;

use App\Models\AudioExportRender;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

        Route::model('audioRender', AudioExportRender::class);
    }
}
