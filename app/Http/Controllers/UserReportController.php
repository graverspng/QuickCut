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

    public function create(Request $request): Response
    {
        return Inertia::render('ReportIssue');
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'project' => ['nullable', 'string', 'max:255'], 
            'issue'   => ['required', 'string', 'max:5000'],
        ]);

        $user = $request->user();


        UserReport::create([
            'user_id' => $user->id,
            'project' => $data['project'] ?? null,
            'issue'   => $data['issue'],
        ]);


        $emailBody = "User report from {$user->name} (ID: {$user->id})\n\n";

        if (!empty($data['project'])) {
            $emailBody .= "Project: {$data['project']}\n\n";
        }

        $emailBody .= "Issue:\n{$data['issue']}";

        Mail::raw($emailBody, function ($message) {
            $message->to('quickcutweb@gmail.com')->subject('New User Report');
        });

        return redirect()
            ->route('dashboard')
            ->with('reportSubmitted', true);
    }
}
