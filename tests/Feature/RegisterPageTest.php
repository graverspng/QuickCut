<?php
it('may welcome the user', function () {
    $page = visit('/register');
 
    $page->assertSee('Create Account')
    ->screenshot(filename: 'register-user.png');
});