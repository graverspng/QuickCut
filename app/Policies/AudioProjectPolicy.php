<?php

namespace App\Policies;

use App\Models\User;
use App\Models\AudioProject;

class AudioProjectPolicy
{
    public function view(User $user, AudioProject $project): bool
    {
        return $user->id === $project->user_id;
    }

    public function update(User $user, AudioProject $project): bool
    {
        return $user->id === $project->user_id;
    }

    public function delete(User $user, AudioProject $project): bool
    {
        return $user->id === $project->user_id;
    }
}
