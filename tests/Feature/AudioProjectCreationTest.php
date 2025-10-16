<?php

use App\Models\AudioProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('allows an authenticated user to create an audio project with valid data', function () {
    $user = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($user)->post(route('audio.projects.store'), [
        'name' => 'My Audio Project',
    ]);

    $project = AudioProject::where('user_id', $user->id)
        ->where('name', 'My Audio Project')
        ->first();

    expect($project)->not()->toBeNull();
    $response->assertRedirect(route('audio.editor', $project));
});

it('rejects audio project creation when the name exceeds 20 characters', function () {
    $user = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($user)
        ->from(route('audio.projects'))
        ->post(route('audio.projects.store'), [
            'name' => str_repeat('A', 21),
        ]);

    $response->assertRedirect(route('audio.projects'));
    $response->assertSessionHasErrors([
        'name' => trans('validation.max.string', ['attribute' => 'name', 'max' => 20]),
    ]);
    expect(AudioProject::count())->toBe(0);
});

it('requires an audio project name to be provided', function () {
    $user = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($user)
        ->from(route('audio.projects'))
        ->post(route('audio.projects.store'), [
            'name' => '',
        ]);

    $response->assertRedirect(route('audio.projects'));
    $response->assertSessionHasErrors([
        'name' => trans('validation.required', ['attribute' => 'name']),
    ]);
    expect(AudioProject::count())->toBe(0);
});

it('prevents guests from accessing audio project creation features', function () {
    $this->get(route('audio.projects'))
        ->assertRedirect(route('login'));

    $this->post(route('audio.projects.store'), ['name' => 'Guest Audio'])
        ->assertRedirect(route('login'));

    expect(AudioProject::count())->toBe(0);
});

it('ignores attempts to assign another users id when creating audio projects', function () {
    $actor = User::factory()->create(['email_verified_at' => now()]);
    $other = User::factory()->create(['email_verified_at' => now()]);

    $response = $this->actingAs($actor)->post(route('audio.projects.store'), [
        'name' => 'Legit Audio',
        'user_id' => $other->id,
    ]);

    $project = AudioProject::where('name', 'Legit Audio')->first();

    expect($project)->not()->toBeNull();
    expect($project->user_id)->toBe($actor->id);
    expect(AudioProject::where('user_id', $other->id)->count())->toBe(0);

    $response->assertRedirect(route('audio.editor', $project));
});
