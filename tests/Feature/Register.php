<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('allows a user to register with valid data', function () {
    $email = strtolower('test_' . Str::random(5) . '@example.com');

    $response = $this->post('/register', [
        'name' => 'Test User',
        'email' => $email,
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertRedirect('/dashboard');

    $this->assertDatabaseHas('users', [
        'email' => $email,
    ]);
});
