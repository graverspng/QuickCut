<?php

namespace App\Http\Controllers;

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

    public function showExport(AudioProject $audioProject): Response
    {
        $this->authorize('view', $audioProject);

        $window = $this->buildAudioWindowData($audioProject);
        $tracks = is_array($audioProject->tracks) ? $audioProject->tracks : [];
        $timelineDuration = $this->calculateTimelineDuration($tracks);

        $summary = [
            'tracks' => count($tracks),
            'sources' => $this->countUniqueSources($tracks),
            'duration' => $timelineDuration,
        ];

        return Inertia::render('AudioExport', [
            'project' => [
                'id' => $audioProject->id,
                'name' => $audioProject->name,
                'description' => $audioProject->description,
                'summary' => $summary,
                'updated_at' => optional($audioProject->updated_at)->toIso8601String(),
            ],
            'exportWindow' => $window,
        ]);
    }

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
                'message' => 'Please save your project in the editor before exporting.',
                'exportWindow' => $window,
            ], 409);
        }

        $tracksPayload = is_array($audioProject->tracks) ? $audioProject->tracks : [];
        if (empty($tracksPayload)) {
            abort(422, 'This audio project does not contain any tracks to export.');
        }

        $exportDir = storage_path('app/exports');
        $this->ensureOutputDirectory($exportDir);

        $prepared = $this->prepareAudioTracks($tracksPayload, $exportDir);
        $tracks = $prepared['tracks'];
        $cleanup = $prepared['cleanup'];
        $timelineDuration = $prepared['duration'];

        if (empty($tracks)) {
            abort(422, 'This audio project does not contain any tracks to export.');
        }

        $exportId = Str::uuid()->toString();
        $fileSafeName = Str::slug($audioProject->name ?: 'quickcut-audio');
        $timestamp = now()->format('Ymd_His');
        $fileName = ($fileSafeName ?: 'quickcut-audio') . "-{$timestamp}-{$exportId}.mp3";
        $outputPath = $exportDir . DIRECTORY_SEPARATOR . $fileName;

        try {
            if (!$this->buildAudioMix($tracks, $timelineDuration, $outputPath)) {
                abort(500, 'Unable to build audio export.');
            }
        } finally {
            foreach ($cleanup as $path) {
                if (is_string($path) && $path !== '' && file_exists($path)) {
                    @unlink($path);
                }
            }
        }

        if (!file_exists($outputPath)) {
            abort(500, 'Unable to build audio export.');
        }

        $downloadName = $fileSafeName ? $fileSafeName . '-quickcut-audio.mp3' : 'quickcut-audio.mp3';
        $fileSize = @filesize($outputPath) ?: null;

        $response = response()->streamDownload(function () use ($outputPath) {
            $handle = @fopen($outputPath, 'rb');
            if (!$handle) {
                @unlink($outputPath);
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
                @fclose($handle);
                @unlink($outputPath);
            }
        }, $downloadName, array_filter([
            'Content-Type' => 'audio/mpeg',
            'Content-Length' => $fileSize ? (string) $fileSize : null,
        ]));

        if ($fileSize !== null) {
            $response->headers->set('Accept-Ranges', 'bytes');
        }
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }

    /**
     * @param array<int, mixed> $tracksPayload
     * @return array{tracks: array<int, array<string, mixed>>, cleanup: array<int, string>, duration: float}
     */
    protected function prepareAudioTracks(array $tracksPayload, string $directory): array
    {
        $cleanup = [];
        $tracks = [];
        $duration = 0.0;
        $mediaById = collect();

        foreach ($tracksPayload as $index => $track) {
            if (!is_array($track)) {
                continue;
            }

            $path = $this->resolveMediaPath($track, $mediaById, $directory, 'audio_' . $index, $cleanup);
            if (!$path) {
                continue;
            }

            $startOffset = max(0.0, (float) Arr::get($track, 'startOffset', 0));
            $startTime = max(0.0, (float) Arr::get($track, 'startTime', 0));
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
                'path' => $path,
                'start_offset' => $startOffset,
                'start_time' => $startTime,
                'duration' => $durationValue,
                'volume' => $volume,
            ];

            $duration = max($duration, $startTime + $durationValue);
        }

        return [
            'tracks' => $tracks,
            'cleanup' => $cleanup,
            'duration' => $duration,
        ];
    }

    /**
     * @param array<int, array{path: string, start_offset: float, start_time: float, duration: float, volume: float}> $tracks
     */
    protected function buildAudioMix(array $tracks, float $timelineDuration, string $outputPath): bool
    {
        $args = ['ffmpeg', '-y'];

        foreach ($tracks as $track) {
            $args[] = '-i';
            $args[] = $track['path'];
        }

        $filterLines = [];
        $labels = [];

        foreach ($tracks as $index => $track) {
            $label = 'a_track_' . $index;
            $startOffset = max(0.0, (float) $track['start_offset']);
            $clipDuration = max(0.0, (float) $track['duration']);
            $delayMs = (int) round(max(0.0, (float) $track['start_time']) * 1000);
            $volume = (float) $track['volume'];

            $trimParts = [sprintf('atrim=start=%0.3f', $startOffset)];
            if ($clipDuration > 0.0) {
                $trimParts[0] .= ':duration=' . sprintf('%0.3f', $clipDuration);
            }
            $trimParts[] = 'asetpts=PTS-STARTPTS';
            if (abs($volume - 1.0) > 0.0001) {
                $trimParts[] = sprintf('volume=%0.4f', $volume);
            }
            $trimParts[] = sprintf('adelay=%d|%d', $delayMs, $delayMs);
            $trimParts[] = 'apad';

            $filterLines[] = sprintf('[%d:a]%s[%s]', $index, implode(',', $trimParts), $label);
            $labels[] = $label;
        }

        if (empty($labels)) {
            return false;
        }

        $audioMixLabel = 'audio_mix';
        $filterLines[] = implode('', array_map(static fn ($label) => '[' . $label . ']', $labels))
            . 'amix=inputs=' . count($labels) . ':normalize=0[' . $audioMixLabel . ']';

        $args[] = '-filter_complex';
        $args[] = implode(';', $filterLines);
        $args[] = '-map';
        $args[] = '[' . $audioMixLabel . ']';
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

        $result = $this->runProcess($args);

        if (!$result) {
            Log::warning('FFmpeg command failed during audio export.', [
                'command' => implode(' ', array_map('escapeshellarg', $args)),
            ]);
        }

        return $result;
    }

    protected function buildAudioWindowData(AudioProject $audioProject): array
    {
        $recentWindow = $this->recentWindowSeconds();
        $lastSavedAt = $audioProject->updated_at ?? $audioProject->created_at ?? now();
        $secondsSinceSave = max(0, $lastSavedAt->diffInSeconds(now()));
        $allowed = $secondsSinceSave <= $recentWindow;

        return [
            'allowed' => $allowed,
            'recent_window_seconds' => $recentWindow,
            'seconds_since_save' => $secondsSinceSave,
            'last_saved_at' => $lastSavedAt->toIso8601String(),
            'last_saved_for_humans' => $lastSavedAt->diffForHumans(),
        ];
    }

    /**
     * @param array<int, mixed> $tracks
     */
    protected function calculateTimelineDuration(array $tracks): float
    {
        $duration = 0.0;
        foreach ($tracks as $track) {
            if (!is_array($track)) {
                continue;
            }

            $start = max(0.0, (float) Arr::get($track, 'startTime', 0));
            $len = (float) Arr::get($track, 'duration', 0);
            $sourceLen = (float) Arr::get($track, 'sourceDuration', 0);
            if ($len <= 0 && $sourceLen > 0) {
                $len = $sourceLen;
            }
            if ($len <= 0) {
                continue;
            }

            $duration = max($duration, $start + $len);
        }

        return $duration;
    }

    /**
     * @param array<int, mixed> $tracks
     */
    protected function countUniqueSources(array $tracks): int
    {
        $sources = [];
        foreach ($tracks as $track) {
            if (!is_array($track)) {
                continue;
            }

            $id = Arr::get($track, 'id');
            $source = Arr::get($track, 'storageKey') ?: Arr::get($track, 'source');
            if ($id) {
                $sources[$id] = true;
                continue;
            }
            if (is_string($source) && $source !== '') {
                $sources[$source] = true;
            }
        }

        return count($sources);
    }
}
