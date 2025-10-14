<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\User;

uses(RefreshDatabase::class);

beforeEach(fn() => User::factory()->create([
    'email' => 'user@example.com',
    'password' => bcrypt('Parole123!'),
]));

it('logs in with valid credentials', fn() =>
    $this->post('/login', [
        'email' => 'user@example.com',
        'password' => 'Parole123!',
    ])
    ->assertRedirect('/dashboard')
    && $this->assertAuthenticated()
);

it('rejects invalid password', fn() =>
    tap($this->from('/login')->post('/login', [
        'email' => 'user@example.com',
        'password' => 'wrongpassword',
    ]), fn($r) => $r->assertRedirect('/login')->assertSessionHasErrors('email'))
    && $this->assertGuest()
);

it('requires email', fn() =>
    tap($this->from('/login')->post('/login', [
        'email' => '',
        'password' => 'Parole123!',
    ]), fn($r) => $r->assertRedirect('/login')->assertSessionHasErrors('email'))
    && $this->assertGuest()
);

it('requires password', fn() =>
    tap($this->from('/login')->post('/login', [
        'email' => 'user@example.com',
        'password' => '',
    ]), fn($r) => $r->assertRedirect('/login')->assertSessionHasErrors('password'))
    && $this->assertGuest()
);

it('rejects unknown email', fn() =>
    tap($this->from('/login')->post('/login', [
        'email' => 'notfound@example.com',
        'password' => 'Parole123!',
    ]), fn($r) => $r->assertRedirect('/login')->assertSessionHasErrors('email'))
    && $this->assertGuest()
);
