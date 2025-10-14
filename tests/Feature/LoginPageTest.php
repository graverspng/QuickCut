<?php
it('may welcome the user', function () {
    $page = visit('/login');
 
    $page->assertSee('Welcome back')
    ->screenshot(filename: 'welcome-user.png');
});
