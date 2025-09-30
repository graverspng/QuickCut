<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;
use App\Models\UserReport;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class AdminController extends Controller
{
    public function index(): Response
    {
        $reports = UserReport::with('user:id,name,email')
            ->select('id','user_id','issue','created_at')
            ->latest()
            ->paginate(10)
            ->withQueryString();

        return Inertia::render('Admin/Index', [
            'reports' => $reports,
        ]);
    }

    public function destroyMany(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:user_reports,id'],
        ]);

        UserReport::whereIn('id', $data['ids'])->delete();

        return back()->with('status', 'deleted');
    }
}

