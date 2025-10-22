<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\User;

uses(RefreshDatabase::class);

beforeEach(fn() => User::factory()->create([
    'email' => 'user@example.com',
    'password' => bcrypt('Parole123!'),
]));

it('registers with valid data', function () {
    $this->post('/register', [
        'name' => 'John Doe',
        'email' => 'newuser@example.com',
        'password' => 'Parole123!',
        'password_confirmation' => 'Parole123!',
    ])->assertRedirect('/dashboard');

    $this->assertAuthenticated()
         ->assertDatabaseHas('users', ['email' => 'newuser@example.com']);
});

$invalidCases = [
    'name too long' => [
        ['name' => str_repeat('A', 21), 'email' => 'toolong@example.com', 'password' => 'Parole123!', 'password_confirmation' => 'Parole123!'],
        'name',
    ],
    'passwords do not match' => [
        ['name' => 'Jane', 'email' => 'mismatch@example.com', 'password' => 'A1!', 'password_confirmation' => 'B2!'],
        'password',
    ],
    'missing email' => [
        ['name' => 'No Email', 'email' => '', 'password' => 'Parole123!', 'password_confirmation' => 'Parole123!'],
        'email',
    ],
    'invalid email format' => [
        ['name' => 'Invalid', 'email' => 'invalid', 'password' => 'Parole123!', 'password_confirmation' => 'Parole123!'],
        'email',
    ],
    'duplicate email' => [
        ['name' => 'Dup', 'email' => 'user@example.com', 'password' => 'Parole123!', 'password_confirmation' => 'Parole123!'],
        'email',
    ],
    'short password' => [
        ['name' => 'Short', 'email' => 'short@example.com', 'password' => '123', 'password_confirmation' => '123'],
        'password',
    ],
    'missing username' => [
        ['name' => '', 'email' => 'nouser@example.com', 'password' => 'Parole123!', 'password_confirmation' => 'Parole123!'],
        'name',
    ],
];

foreach ($invalidCases as $case => [$data, $error]) {
    it("rejects registration when {$case}", function () use ($data, $error) {
        $this->from('/register')->post('/register', $data)
             ->assertRedirect('/register')
             ->assertSessionHasErrors($error);
        $this->assertGuest();
    });
}
