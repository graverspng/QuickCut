<?php

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('allows an authenticated user to create a project with valid data', function () {
    $user = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($user)->post(route('projects.store'), [
        'name' => 'Valid Project',
    ]);

    $project = Project::where('user_id', $user->id)->where('name', 'Valid Project')->first();

    expect($project)->not()->toBeNull();
    $response->assertRedirect(route('editor', ['project' => $project->id]));
});

it('rejects project creation when the name exceeds 20 characters', function () {
    $user = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($user)->from(route('dashboard'))->post(route('projects.store'), [
        'name' => str_repeat('A', 21),
    ]);

    $response->assertRedirect(route('dashboard'));
    $response->assertSessionHasErrors([
        'name' => trans('validation.max.string', ['attribute' => 'name', 'max' => 20]),
    ]);
    expect(Project::count())->toBe(0);
});

it('requires a project name to be provided', function () {
    $user = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($user)->from(route('dashboard'))->post(route('projects.store'), [
        'name' => '',
    ]);

    $response->assertRedirect(route('dashboard'));
    $response->assertSessionHasErrors([
        'name' => trans('validation.required', ['attribute' => 'name']),
    ]);
    expect(Project::count())->toBe(0);
});

it('prevents guests from accessing project creation features', function () {
    $this->get(route('dashboard'))->assertRedirect(route('login'));

    $this->post(route('projects.store'), ['name' => 'Guest Project'])
        ->assertRedirect(route('login'));

    expect(Project::count())->toBe(0);
});

it('ignores attempts to set another users id during creation', function () {
    $actor = User::factory()->create(['email_verified_at' => now()]);
    $other = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($actor)->post(route('projects.store'), [
        'name' => 'Owner Check',
        'user_id' => $other->id,
    ]);

    $project = Project::where('name', 'Owner Check')->first();

    expect($project)->not()->toBeNull();
    expect($project->user_id)->toBe($actor->id);
    expect(Project::where('user_id', $other->id)->count())->toBe(0);

    $response->assertRedirect(route('editor', ['project' => $project->id]));
});
