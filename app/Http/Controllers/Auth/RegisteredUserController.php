<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Inertia\Inertia;
use Inertia\Response;

class RegisteredUserController extends Controller
{
    /**
     * Parāda reģistrācijas skatu (formu).
     * 
     * @return Response
     */
    public function create(): Response
    {
        // Atgriež Inertia skatu ar reģistrācijas lapu
        return Inertia::render('Auth/Register');
    }

    /**
     * Apstrādā ienākošo reģistrācijas pieprasījumu.
     * Veic datu validāciju, izveido jaunu lietotāju, autorizē to un novirza uz dashboard.
     *
     * @throws \Illuminate\Validation\ValidationException
     * @param Request $request
     * @return RedirectResponse
     */
    public function store(Request $request): RedirectResponse
    {
        // Validē ievadītos datus: name, email un password
        $request->validate([
            'name' => 'required|string|max:255',                            // Vārds ir obligāts, teksts, max 255 simboli
            'email' => 'required|string|lowercase|email|max:255|unique:'.User::class,  // Epasts obligāts, email formāts, unikāls lietotāju tabulā
            'password' => ['required', 'confirmed', Rules\Password::defaults()],  // Parole obligāta, jāatbilst noteikumiem, jāsakrīt ar apstiprinājumu
        ]);

        // Izveido jaunu lietotāju ar noformētajiem datiem
        $user = User::create([
            'name' => $request->name,                                      // Lietotāja vārds
            'email' => $request->email,                                    // Lietotāja e-pasts
            'password' => Hash::make($request->password),                  // Paroles šifrēšana (hashēšana)
        ]);

        // Izsauc notikumu, ka lietotājs ir reģistrējies (var izmantot email apstiprināšanai, utt.)
        event(new Registered($user));

        // Automātiski autorizē (piesldedzas) jaunizveidotajā lietotājā
        Auth::login($user);

        // Pāradresē uz dashboard lapu
        return redirect(route('dashboard', absolute: false));
    }
}
