<?php

namespace App\Http\Controllers;

use App\Jobs\RenderAudioExport;
use App\Models\AudioExportRender;
use App\Models\AudioProject;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class AudioProjectExportController extends ProjectExportController
{
    use AuthorizesRequests;

    // -------------------------------------------------------------------------
    // Export page
    // -------------------------------------------------------------------------

    public function showExport(AudioProject $audioProject): Response
    {
        $this->authorize('view', $audioProject);

        $window  = $this->buildAudioWindowData($audioProject);
        $tracks  = is_array($audioProject->tracks) ? $audioProject->tracks : [];
        $summary = [
            'tracks'   => count($tracks),
            'sources'  => $this->countUniqueSources($tracks),
            'duration' => $this->calculateTimelineDuration($tracks),
        ];

        return Inertia::render('AudioExport', [
            'project' => [
                'id'         => $audioProject->id,
                'name'       => $audioProject->name,
                'description'=> $audioProject->description,
                'summary'    => $summary,
                'updated_at' => optional($audioProject->updated_at)->toIso8601String(),
            ],
            'exportWindow' => $window,
        ]);
    }

    // -------------------------------------------------------------------------
    // Queue-based export (new)
    // -------------------------------------------------------------------------

    // NOTE: kept as a separate method name so it doesn't accidentally override
    // the ProjectExportController::queue(...) signature. That parent method
    // is for video projects and has a different type-hint which caused a
    // fatal error during class loading when this controller attempted to
    // override it with a different parameter type. Keeping a distinct
    // method name is a minimal, safe change that resolves the boot-time
    // fatal error while preserving behavior and the named route.
    public function queueAudio(Request $request, AudioProject $audioProject)
    {
        $this->authorize('view', $audioProject);

        $window = $this->buildAudioWindowData($audioProject);
        if (!$window['allowed'] && !$request->boolean('force')) {
            return response()->json([
                'code'         => 'RECENT_SAVE_REQUIRED',
                'message'      => 'Please save your project in the editor before exporting.',
                'exportWindow' => $window,
            ], 409);
        }

        $render = AudioExportRender::create([
            'audio_project_id' => $audioProject->id,
            'user_id'          => auth()->id(),
            'status'           => 'pending',
        ]);

        RenderAudioExport::dispatch($render->id, $audioProject->id);

        return response()->json([
            'render_id'    => $render->id,
            'status'       => 'pending',
            'exportWindow' => $window,
        ]);
    }

    public function jobStatusAudio(Request $request, AudioProject $audioProject, AudioExportRender $audioRender)
    {
        $this->authorize('view', $audioProject);

        if ($audioRender->user_id !== auth()->id() || $audioRender->audio_project_id !== $audioProject->id) {
            abort(403);
        }

        $audioRender->refresh();

        return response()->json([
            'render_id'     => $audioRender->id,
            'status'        => $audioRender->status,
            'progress_step' => $audioRender->progress_step,
            'error_message' => $audioRender->status === 'failed' ? $audioRender->error_message : null,
            'error_code'    => $audioRender->status === 'failed' ? $audioRender->error_code : null,
            'has_file'      => $audioRender->status === 'done'
                && is_string($audioRender->output_path)
                && file_exists($audioRender->output_path),
        ]);
    }

    public function jobDownloadAudio(Request $request, AudioProject $audioProject, AudioExportRender $audioRender)
    {
        $this->authorize('view', $audioProject);

        if ($audioRender->user_id !== auth()->id() || $audioRender->audio_project_id !== $audioProject->id) {
            abort(403);
        }

        if ($audioRender->status !== 'done') {
            return response()->json(['message' => 'Export is not ready for download.'], 409);
        }

        $path = $audioRender->output_path;
        if (!$path || !file_exists($path)) {
            return response()->json(['message' => 'Export file not found. Please run a new export.'], 404);
        }

        $fileSafeName = Str::slug($audioProject->name ?: 'quickcut-audio');
        $downloadName = ($fileSafeName ?: 'quickcut-audio') . '-export.mp3';

        $fileSize = @filesize($path) ?: null;

        $response = response()->streamDownload(function () use ($path) {
            $handle = @fopen($path, 'rb');
            if (!$handle) {
                return;
            }
            try {
                while (!feof($handle)) {
                    echo fread($handle, 1024 * 512);
                    if (function_exists('ob_flush')) {
                        @ob_flush();
                    }
                    flush();
                }
            } finally {
                fclose($handle);
                @unlink($path);
            }
        }, $downloadName, array_filter([
            'Content-Type'   => 'audio/mpeg',
            'Content-Length' => $fileSize,
        ]));

        if ($fileSize !== null) {
            $response->headers->set('Accept-Ranges', 'bytes');
        }
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }

    // -------------------------------------------------------------------------
    // Core audio render — called by the queue job
    // -------------------------------------------------------------------------

    public function executeAudioExport(AudioProject $audioProject, ?\Closure $onProgress = null): array
    {
        $step = function (string $msg) use ($onProgress): void {
            if ($onProgress) {
                ($onProgress)($msg);
            }
        };

        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        @ini_set('max_execution_time', '0');

        $tracksPayload = is_array($audioProject->tracks) ? $audioProject->tracks : [];
        if (empty($tracksPayload)) {
            return ['ok' => false, 'code' => 'NO_TRACKS', 'message' => 'This audio project has no tracks to export.'];
        }

        $exportDir = storage_path('app/exports');
        $this->ensureOutputDirectory($exportDir);

        $step('Preparing audio tracks…');
        $prepared        = $this->prepareAudioTracks($tracksPayload, $exportDir);
        $tracks          = $prepared['tracks'];
        $cleanup         = $prepared['cleanup'];
        $timelineDuration = $prepared['duration'];

        if (empty($tracks)) {
            return ['ok' => false, 'code' => 'NO_TRACKS', 'message' => 'Could not resolve any audio track files.'];
        }

        $exportId     = Str::uuid()->toString();
        $fileSafeName = Str::slug($audioProject->name ?: 'quickcut-audio');
        $timestamp    = now()->format('Ymd_His');
        $fileName     = ($fileSafeName ?: 'quickcut-audio') . "-{$timestamp}-{$exportId}.mp3";
        $outputPath   = $exportDir . DIRECTORY_SEPARATOR . $fileName;

        $step('Mixing ' . count($tracks) . ' track(s) with FFmpeg…');

        try {
            if (!$this->buildAudioMix($tracks, $timelineDuration, $outputPath)) {
                return ['ok' => false, 'code' => 'FFMPEG_FAILED', 'message' => 'FFmpeg audio mix failed. Check server logs.'];
            }
        } finally {
            foreach ($cleanup as $path) {
                if (is_string($path) && $path !== '' && file_exists($path)) {
                    @unlink($path);
                }
            }
        }

        if (!file_exists($outputPath)) {
            return ['ok' => false, 'code' => 'MISSING_OUTPUT', 'message' => 'Export finished without producing an output file.'];
        }

        $step('Done.');

        $downloadName = ($fileSafeName ?: 'quickcut-audio') . '-export.mp3';

        return ['ok' => true, 'path' => $outputPath, 'download_name' => $downloadName];
    }

    // -------------------------------------------------------------------------
    // Legacy direct-download (kept for backward compat, now delegates to execute)
    // -------------------------------------------------------------------------

    public function downloadExport(Request $request, AudioProject $audioProject)
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        @ini_set('max_execution_time', '0');

        $this->authorize('view', $audioProject);

        $window = $this->buildAudioWindowData($audioProject);
        if (!$window['allowed']) {
            return response()->json([
                'message'      => 'Please save your project in the editor before exporting.',
                'exportWindow' => $window,
            ], 409);
        }

        $result = $this->executeAudioExport($audioProject);

        if (!$result['ok']) {
            return response()->json([
                'code'    => $result['code'],
                'message' => $result['message'],
            ], $result['code'] === 'NO_TRACKS' ? 422 : 500);
        }

        return $this->streamFile($result['path'], $result['download_name']);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    protected function streamFile(string $path, string $downloadName): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $fileSize = @filesize($path) ?: null;

        $response = response()->streamDownload(function () use ($path) {
            $handle = @fopen($path, 'rb');
            if (!$handle) {
                return;
            }
            try {
                while (!feof($handle)) {
                    echo fread($handle, 1024 * 512);
                    if (function_exists('ob_flush')) {
                        @ob_flush();
                    }
                    flush();
                }
            } finally {
                fclose($handle);
                @unlink($path);
            }
        }, $downloadName, array_filter([
            'Content-Type'   => 'audio/mpeg',
            'Content-Length' => $fileSize ? (string) $fileSize : null,
        ]));

        if ($fileSize !== null) {
            $response->headers->set('Accept-Ranges', 'bytes');
        }
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }

    protected function buildAudioWindowData(AudioProject $audioProject): array
    {
        $recentWindow    = $this->recentWindowSeconds();
        $lastSavedAt     = $audioProject->updated_at ?? $audioProject->created_at ?? now();
        $expiresAt       = $lastSavedAt->copy()->addSeconds($recentWindow);
        $secondsSinceSave = max(0, $lastSavedAt->diffInSeconds(now()));
        $allowed         = now()->lte($expiresAt);

        return [
            'allowed'               => $allowed,
            'recent_window_seconds' => $recentWindow,
            'seconds_since_save'    => $secondsSinceSave,
            'last_saved_at'         => $lastSavedAt->toIso8601String(),
            'export_expires_at'     => $expiresAt->toIso8601String(),
            'last_saved_for_humans' => $lastSavedAt->diffForHumans(),
        ];
    }

    /**
     * @param array<int, mixed> $tracksPayload
     * @return array{tracks: list<array<string,mixed>>, cleanup: list<string>, duration: float}
     */
    protected function prepareAudioTracks(array $tracksPayload, string $directory): array
    {
        $cleanup  = [];
        $tracks   = [];
        $duration = 0.0;
        $mediaById = collect();

        foreach ($tracksPayload as $index => $track) {
            if (!is_array($track)) {
                continue;
            }

            $path = $this->resolveMediaPath($track, $mediaById, $directory, 'audio_' . $index, $cleanup);
            if (!$path) {
                Log::warning('[AudioExport] Could not resolve path for track', ['index' => $index, 'track' => $track]);
                continue;
            }

            $startOffset   = max(0.0, (float) Arr::get($track, 'startOffset', 0));
            $startTime     = max(0.0, (float) Arr::get($track, 'startTime', 0));
            $durationValue = (float) Arr::get($track, 'duration', 0);
            $sourceDuration = (float) Arr::get($track, 'sourceDuration', 0);

            if ($durationValue <= 0 && $sourceDuration > 0) {
                $durationValue = $sourceDuration;
            }
            $durationValue = max(0.0, $durationValue);

            if ($durationValue <= 0) {
                continue;
            }

            $volume = (float) Arr::get($track, 'volume', 1.0);
            if (!is_finite($volume)) {
                $volume = 1.0;
            }
            $volume = max(0.0, min(4.0, $volume));

            $tracks[] = [
                'path'         => $path,
                'start_offset' => $startOffset,
                'start_time'   => $startTime,
                'duration'     => $durationValue,
                'volume'       => $volume,
            ];

            $duration = max($duration, $startTime + $durationValue);
        }

        return ['tracks' => $tracks, 'cleanup' => $cleanup, 'duration' => $duration];
    }

    /**
     * @param array<int, array{path:string,start_offset:float,start_time:float,duration:float,volume:float}> $tracks
     */
    protected function buildAudioMix(array $tracks, float $timelineDuration, string $outputPath): bool
    {
        $args = ['ffmpeg', '-y'];

        foreach ($tracks as $track) {
            $args[] = '-i';
            $args[] = $track['path'];
        }

        $filterLines = [];
        $labels      = [];

        foreach ($tracks as $index => $track) {
            $label       = 'a_track_' . $index;
            $startOffset = max(0.0, (float) $track['start_offset']);
            $clipDuration = max(0.0, (float) $track['duration']);
            $delayMs     = (int) round(max(0.0, (float) $track['start_time']) * 1000);
            $volume      = (float) $track['volume'];

            $parts = [sprintf('atrim=start=%0.3f:duration=%0.3f', $startOffset, $clipDuration)];
            $parts[] = 'asetpts=PTS-STARTPTS';
            if (abs($volume - 1.0) > 0.0001) {
                $parts[] = sprintf('volume=%0.4f', $volume);
            }
            $parts[] = sprintf('adelay=%d|%d', $delayMs, $delayMs);
            $parts[] = 'apad';

            $filterLines[] = sprintf('[%d:a]%s[%s]', $index, implode(',', $parts), $label);
            $labels[] = $label;
        }

        if (empty($labels)) {
            return false;
        }

        $mixLabel      = 'audio_mix';
        $filterLines[] = implode('', array_map(fn ($l) => '[' . $l . ']', $labels))
            . 'amix=inputs=' . count($labels) . ':normalize=0[' . $mixLabel . ']';

        $args[] = '-filter_complex';
        $args[] = implode(';', $filterLines);
        $args[] = '-map';
        $args[] = '[' . $mixLabel . ']';
        $args[] = '-vn';
        $args[] = '-c:a';
        $args[] = 'libmp3lame';
        $args[] = '-b:a';
        $args[] = '192k';
        $args[] = '-ar';
        $args[] = '44100';
        $args[] = '-ac';
        $args[] = '2';

        if ($timelineDuration > 0.0) {
            $args[] = '-t';
            $args[] = sprintf('%.3f', $timelineDuration);
        }

        $args[] = $outputPath;

        return $this->runProcess($args);
    }

    protected function calculateTimelineDuration(array $tracks): float
    {
        $duration = 0.0;
        foreach ($tracks as $track) {
            if (!is_array($track)) {
                continue;
            }
            $start = max(0.0, (float) Arr::get($track, 'startTime', 0));
            $len   = (float) Arr::get($track, 'duration', 0);
            if ($len <= 0) {
                $len = (float) Arr::get($track, 'sourceDuration', 0);
            }
            if ($len <= 0) {
                continue;
            }
            $duration = max($duration, $start + $len);
        }
        return $duration;
    }

    protected function countUniqueSources(array $tracks): int
    {
        $sources = [];
        foreach ($tracks as $track) {
            if (!is_array($track)) {
                continue;
            }
            $id     = Arr::get($track, 'id');
            $source = Arr::get($track, 'storageKey') ?: Arr::get($track, 'source');
            if ($id) {
                $sources[$id] = true;
            } elseif (is_string($source) && $source !== '') {
                $sources[$source] = true;
            }
        }
        return count($sources);
    }
}
