<?php

namespace App\Providers;

use App\Models\Project;
use App\Policies\ProjectPolicy;
use App\Models\AudioProject;
use App\Policies\AudioProjectPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Project::class => ProjectPolicy::class,
        AudioProject::class => AudioProjectPolicy::class, // 👈 Added
    ];

    public function boot(): void
    {
        $this->registerPolicies();
    }
}
