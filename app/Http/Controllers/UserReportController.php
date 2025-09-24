<?php

namespace App\Http\Controllers;

use App\Models\UserReport;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class UserReportController extends Controller
{
    /**
     * Show the report submission form.
     */
    public function create(Request $request): Response
    {
        return Inertia::render('ReportIssue');
    }

    /**
     * Store a newly submitted report.
     */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'issue' => ['required', 'string', 'max:5000'],
        ]);

        $user = $request->user();

        UserReport::create([
            'user_id' => $user->id,
            'issue' => $data['issue'],
        ]);

        Mail::raw(
            "User report from {$user->name} (ID: {$user->id})\n\nIssue:\n{$data['issue']}",
            function ($message) {
                $message->to('quickcutweb@gmail.com')->subject('New User Report');
            }
        );

        return redirect()
            ->route('dashboard')
            ->with('reportSubmitted', true);
    }
}