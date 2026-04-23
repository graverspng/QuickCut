<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{

    protected $rootView = 'app';


    public function version(Request $request): ?string
    {
        return parent::version($request);
    }


    public function share(Request $request): array
    {
        $shared = parent::share($request);

        return array_merge($shared, [
            'auth' => [
                'user' => $request->user(),
            ],
            'flash' => [
                'reportSubmitted' => $request->session()->get('reportSubmitted'),
                'loginSuccess'    => $request->session()->get('loginSuccess'),
            ],
        ]);
    }
}
