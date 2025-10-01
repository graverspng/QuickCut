<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Symfony\Component\Process\Process;

class ProjectExportController extends Controller
{
    protected function recentWindowSeconds(): int
    {
        return (int) config('quickcut.export.recent_window_seconds', 300);
    }

    protected function ensureOwner(Project $project): void
    {
        Gate::authorize('view', $project);
    }

    protected function buildWindowData(Project $project): array
    {
        $recentWindow = $this->recentWindowSeconds();
        $lastSavedAt = $project->updated_at ?? $project->created_at ?? now();
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

    public function show(Project $project)
    {
        $this->ensureOwner($project);

        $window = $this->buildWindowData($project);
        $summary = [
            'media' => count($project->media_files ?? []),
            'clips' => count($project->clips ?? []),
            'music' => count($project->music_tracks ?? []),
            'effects' => count($project->effects ?? []),
            'text' => count($project->text_overlays ?? []),
            'transitions' => count($project->transitions ?? []),
            'duration' => collect($project->clips ?? [])->sum(fn ($clip) => (float) ($clip['duration'] ?? 0)),
        ];

        return Inertia::render('Export', [
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'description' => $project->description,
                'summary' => $summary,
                'updated_at' => optional($project->updated_at)->toIso8601String(),
            ],
            'exportWindow' => $window,
        ]);
    }

    protected function ensureOutputDirectory(string $directory): void
    {
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }
    }

    protected function decodeDataUrl(?string $dataUrl, string $prefix, string $directory): ?array
    {
        if (!is_string($dataUrl) || $dataUrl === '') {
            return null;
        }

        if (!preg_match('#^data:(?P<mime>[^;]+);base64,(?P<data>.+)$#', $dataUrl, $matches)) {
            return null;
        }

        $binary = base64_decode($matches['data'], true);
        if ($binary === false) {
            return null;
        }

        $mime = strtolower($matches['mime']);
        $extension = match ($mime) {
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'video/ogg', 'video/ogv' => 'ogv',
            default => 'mp4',
        };

        $path = $directory . DIRECTORY_SEPARATOR . $prefix . '.' . $extension;
        file_put_contents($path, $binary);

        return ['path' => $path, 'mime' => $mime];
    }

    protected function gatherClipSources(Project $project, string $directory): array
    {
        $sources = [];
        $cleanup = [];

        $mediaFiles = collect($project->media_files ?? [])
            ->map(fn ($item) => is_array($item) ? $item : [])
            ->filter()
            ->values();

        $mediaById = $mediaFiles->mapWithKeys(function ($item) {
            $id = Arr::get($item, 'id');
            if (!$id) {
                return [];
            }

            return [$id => $item];
        });

        foreach (($project->clips ?? []) as $index => $clip) {
            if (!is_array($clip)) {
                continue;
            }

            $storageKey = Arr::get($clip, 'storageKey') ?: Arr::get($clip, 'path');
            $sourceId = Arr::get($clip, 'mediaId') ?: Arr::get($clip, 'id');
            $fallbackSource = Arr::get($clip, 'fallbackSource');

            $mediaPath = null;
            if ($storageKey && Storage::disk('public')->exists($storageKey)) {
                $mediaPath = Storage::disk('public')->path($storageKey);
            }

            if (!$mediaPath && $sourceId && $mediaById->has($sourceId)) {
                $candidate = Arr::get($mediaById[$sourceId], 'path');
                if ($candidate && Storage::disk('public')->exists($candidate)) {
                    $mediaPath = Storage::disk('public')->path($candidate);
                }
            }

            if (!$mediaPath) {
                $decoded = $this->decodeDataUrl($fallbackSource, 'clip_' . $index . '_' . Str::random(6), $directory);
                if ($decoded) {
                    $mediaPath = $decoded['path'];
                    $cleanup[] = $mediaPath;
                }
            }

            if ($mediaPath) {
                $sources[] = $mediaPath;
            }
        }

        return ['paths' => $sources, 'cleanup' => $cleanup];
    }

    protected function combineVideoSegments(array $paths, string $outputPath): bool
    {
        if (empty($paths)) {
            return false;
        }

        if (count($paths) === 1) {
            return copy($paths[0], $outputPath);
        }

        $listPath = tempnam(dirname($outputPath), 'concat_');
        $escaped = collect($paths)->map(function ($path) {
            $escapedPath = str_replace("'", "'\\''", $path);
            return "file '$escapedPath'";
        })->implode(PHP_EOL);
        file_put_contents($listPath, $escaped);

        $process = new Process([
            'ffmpeg',
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', $listPath,
            '-c', 'copy',
            $outputPath,
        ]);
        $process->setTimeout(120);
        $process->run();
        @unlink($listPath);

        if (!$process->isSuccessful()) {
            Log::warning('FFmpeg concat failed during export.', [
                'output' => $process->getErrorOutput(),
            ]);

            return copy($paths[0], $outputPath);
        }

        return file_exists($outputPath);
    }

    public function download(Request $request, Project $project)
    {
        $this->ensureOwner($project);

        $window = $this->buildWindowData($project);
        if (!$window['allowed']) {
            return response()->json([
                'message' => 'Please save your project in the editor before exporting.',
                'exportWindow' => $window,
            ], 409);
        }

        $exportId = Str::uuid()->toString();
        $directory = storage_path('app/exports');
        $this->ensureOutputDirectory($directory);

        $fileSafeName = Str::slug($project->name ?: 'quickcut-project');
        $timestamp = now()->format('Ymd_His');
        $videoFileName = $fileSafeName ? $fileSafeName . "-{$timestamp}-{$exportId}.mp4" : "quickcut-project-{$timestamp}-{$exportId}.mp4";
        $videoPath = $directory . DIRECTORY_SEPARATOR . $videoFileName;

        $gathered = $this->gatherClipSources($project, $directory);
        $paths = $gathered['paths'];


        $zip = new ZipArchive();
        if (empty($paths)) {
            abort(422, 'This project does not contain any video clips to export.');
        }

        try {
            $success = $this->combineVideoSegments($paths, $videoPath);
        } finally {
            foreach ($gathered['cleanup'] ?? [] as $tempPath) {
                if (is_string($tempPath)) {
                    @unlink($tempPath);
                }
            }
        }

        if (!$success || !file_exists($videoPath)) {
            abort(500, 'Unable to build video export.');
        }

        $downloadName = $fileSafeName ? $fileSafeName . '-quickcut-export.mp4' : 'quickcut-export.mp4';

        return response()->download($videoPath, $downloadName, [
            'Content-Type' => 'video/mp4',
        ])->deleteFileAfterSend(true);
    }
}