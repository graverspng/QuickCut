<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

class ProjectPolicy
{
    /**
     * Determine whether the user can update the project.
     */
    public function update(User $user, Project $project): bool
    {
        // Only allow the project owner to update
        return $user->id === $project->user_id;
    }

    /**
     * Determine whether the user can delete the project.
     */
    public function delete(User $user, Project $project): bool
    {
        return $user->id === $project->user_id;
    }

    /**
     * Optional: allow viewing
     */
    public function view(User $user, Project $project): bool
    {
        return $user->id === $project->user_id;
    }
}
