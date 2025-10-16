<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
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

    protected function resolveDefaultFontPath(): ?string
    {
        static $cached = null;

        if ($cached !== null) {
            return $cached;
        }

        $configured = config('quickcut.export.default_font_path');
        if (is_string($configured) && $configured !== '' && file_exists($configured)) {
            return $cached = $configured;
        }

        $projectFont = public_path('fonts/suisse/fonnts.com-Suisse_Intl_Regular.ttf');
        if ($projectFont && file_exists($projectFont)) {
            return $cached = $projectFont;
        }

        $fallback = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

        return $cached = (file_exists($fallback) ? $fallback : null);
    }

    protected function escapeFilterValue(string $value): string
    {
        $escaped = strtr($value, [
            '\\' => '\\\\',
            ':' => '\\:',
            "'" => "\\'",
            '[' => '\\[',
            ']' => '\\]',
            ',' => '\\,',
            ';' => '\\;',
            '%' => '\\%',
        ]);
        $escaped = str_replace(["\r\n", "\r"], "\n", $escaped);

        return str_replace("\n", '\\n', $escaped);
    }

    protected function quoteFilterValue(string $value): string
    {
        return "'" . $this->escapeFilterValue($value) . "'";
    }

    protected function normalizeStorageReference(?string $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $value = trim(rawurldecode($value));
        if ($value === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $value)) {
            $parsed = parse_url($value, PHP_URL_PATH);
            if (is_string($parsed) && $parsed !== '') {
                $value = $parsed;
            }
        }

        $value = ltrim($value, '/');

        if (str_starts_with($value, 'storage/')) {
            $value = substr($value, strlen('storage/'));
        }

        if (str_starts_with($value, 'public/')) {
            $value = substr($value, strlen('public/'));
        }

        return ltrim($value, '/');
    }

    protected function findExistingMediaPath(?string $candidate): ?string
    {
        if (!is_string($candidate) || $candidate === '') {
            return null;
        }

        $candidate = trim($candidate);
        if ($candidate === '') {
            return null;
        }

        if (file_exists($candidate)) {
            return realpath($candidate) ?: $candidate;
        }

        $normalized = $this->normalizeStorageReference($candidate);
        if (!$normalized) {
            return null;
        }

        $disk = Storage::disk('public');
        if ($disk->exists($normalized)) {
            return $disk->path($normalized);
        }

        $storagePath = storage_path('app/public/' . ltrim($normalized, '/'));
        if (file_exists($storagePath)) {
            return $storagePath;
        }

        $publicStoragePath = public_path('storage/' . ltrim($normalized, '/'));
        if (file_exists($publicStoragePath)) {
            return $publicStoragePath;
        }

        return null;
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
            'audio/mpeg', 'audio/mp3' => 'mp3',
            'audio/wav', 'audio/x-wav' => 'wav',
            'audio/ogg', 'audio/oga', 'audio/vorbis' => 'ogg',
            'audio/webm' => 'webm',
            'audio/aac' => 'aac',
            'audio/mp4', 'audio/m4a', 'audio/x-m4a' => 'm4a',
            'audio/flac' => 'flac',
            'image/png' => 'png',
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            default => str_starts_with($mime, 'audio/') ? 'mp3' : (str_starts_with($mime, 'image/') ? 'png' : 'mp4'),
        };

        $path = $directory . DIRECTORY_SEPARATOR . $prefix . '.' . $extension;
        file_put_contents($path, $binary);

        return ['path' => $path, 'mime' => $mime];
    }

    protected function resolveMediaPath(array $item, $mediaById, string $directory, string $prefix, array &$cleanup): ?string
    {
        $sourceId = Arr::get($item, 'mediaId') ?: Arr::get($item, 'id');
        $fallbackSource = Arr::get($item, 'fallbackSource');
        if (!$fallbackSource) {
            $sourceValue = Arr::get($item, 'source');
            if (is_string($sourceValue) && str_starts_with($sourceValue, 'data:')) {
                $fallbackSource = $sourceValue;
            }
        }

        $candidates = [
            Arr::get($item, 'storageKey'),
            Arr::get($item, 'path'),
            Arr::get($item, 'source'),
            Arr::get($item, 'url'),
        ];
        $httpCandidates = [];

        $mediaSource = null;
        if ($sourceId && $mediaById && $mediaById->has($sourceId)) {
            $mediaSource = $mediaById[$sourceId];
            $candidates[] = Arr::get($mediaSource, 'storageKey');
            $candidates[] = Arr::get($mediaSource, 'path');
            $candidates[] = Arr::get($mediaSource, 'source');
            $candidates[] = Arr::get($mediaSource, 'url');
            if (!$fallbackSource) {
                $fallbackSource = Arr::get($mediaSource, 'fallbackSource');
            }
        }

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && preg_match('#^https?://#i', $candidate)) {
                $httpCandidates[] = $candidate;
            }
            $resolved = $this->findExistingMediaPath($candidate);
            if ($resolved) {
                return $resolved;
            }
        }

        if ($fallbackSource) {
            $decoded = $this->decodeDataUrl($fallbackSource, $prefix . '_' . Str::random(6), $directory);
            if ($decoded) {
                $cleanup[] = $decoded['path'];
                return $decoded['path'];
            }
        }

        foreach ($httpCandidates as $url) {
            try {
                $response = Http::timeout(20)->get($url);
                if (!$response->successful()) {
                    continue;
                }
                $contents = $response->body();
                if ($contents === '' || $contents === false) {
                    continue;
                }
                $extension = pathinfo(parse_url($url, PHP_URL_PATH) ?? '', PATHINFO_EXTENSION);
                if (!$extension) {
                    $extension = match (Str::lower(Arr::get($item, 'mime', ''))) {
                        'video/mp4' => 'mp4',
                        'video/webm' => 'webm',
                        'video/ogg', 'video/ogv' => 'ogv',
                        'audio/mpeg', 'audio/mp3' => 'mp3',
                        'audio/wav', 'audio/x-wav' => 'wav',
                        'audio/ogg', 'audio/oga', 'audio/vorbis' => 'ogg',
                        'audio/webm' => 'webm',
                        'audio/aac' => 'aac',
                        'audio/mp4', 'audio/m4a', 'audio/x-m4a' => 'm4a',
                        'audio/flac' => 'flac',
                        'image/png' => 'png',
                        'image/jpeg', 'image/jpg' => 'jpg',
                        'image/webp' => 'webp',
                        'image/gif' => 'gif',
                        default => 'mp4',
                    };
                }
                $tempPath = $directory . DIRECTORY_SEPARATOR . $prefix . '_' . Str::random(6) . '.' . $extension;
                file_put_contents($tempPath, $contents);
                $cleanup[] = $tempPath;
                return $tempPath;
            } catch (\Throwable $e) {
                Log::warning('Failed to download media asset for export.', [
                    'url' => $url,
                    'error' => $e->getMessage(),
                ]);
                continue;
            }
        }

        return null;
    }

    protected function runProcess(array $arguments): bool
    {
        $process = new Process($arguments);
        $process->setTimeout(300);
        $process->run();

        if ($process->isSuccessful()) {
            return true;
        }

        Log::warning('FFmpeg command failed during export.', [
            'command' => $process->getCommandLine(),
            'output' => $process->getErrorOutput(),
        ]);

        return false;
    }

    protected function ensureEvenDimension(int $value): int
    {
        return $value % 2 === 0 ? $value : $value + 1;
    }

    protected function buildScalingFilter(?array $targetDimensions): ?string
    {
        if (!is_array($targetDimensions)) {
            return null;
        }

        $width = (int) ($targetDimensions['width'] ?? 0);
        $height = (int) ($targetDimensions['height'] ?? 0);

        if ($width <= 0 || $height <= 0) {
            return null;
        }

        $width = $this->ensureEvenDimension($width);
        $height = $this->ensureEvenDimension($height);

        return sprintf(
            'scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:black',
            $width,
            $height,
            $width,
            $height
        );
    }

    protected function renderImageSegment(string $imagePath, string $outputPath, float $duration, ?array $targetDimensions = null): bool
    {
        $duration = max(0.1, $duration);
        $args = [
            'ffmpeg',
            '-y',
            '-loop', '1',
            '-framerate', '30',
            '-i', $imagePath,
        ];

        $filter = $this->buildScalingFilter($targetDimensions) ?? 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        $args = array_merge($args, ['-vf', $filter]);

        $args = array_merge($args, [
            '-t', sprintf('%.3f', $duration),
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-r', '30',
            '-video_track_timescale', '15360',
            '-movflags', '+faststart',
            $outputPath,
        ]);

        return $this->runProcess($args);
    }

    protected function trimClipSegment(string $sourcePath, string $outputPath, float $startOffset, float $duration, ?array $targetDimensions = null): bool
    {
        $args = ['ffmpeg', '-y'];
        if ($startOffset > 0) {
            $args = array_merge($args, ['-ss', sprintf('%.3f', max(0, $startOffset))]);
        }

        $args = array_merge($args, ['-i', $sourcePath]);

        if ($duration > 0) {
            $args = array_merge($args, ['-t', sprintf('%.3f', max(0, $duration))]);
        }

        $filter = $this->buildScalingFilter($targetDimensions);
        if ($filter) {
            $args = array_merge($args, ['-vf', $filter]);
        }

        $args = array_merge($args, [
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-r', '30',
            '-video_track_timescale', '15360',
            '-ar', '48000',
            '-movflags', '+faststart',
            $outputPath,
        ]);

        return $this->runProcess($args);
    }

    protected function hasAudioStream(string $path): bool
    {
        $process = new Process([
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'a',
            '-show_entries', 'stream=codec_type',
            '-of', 'csv=p=0',
            $path,
        ]);
        $process->setTimeout(30);
        $process->run();

        if (!$process->isSuccessful()) {
            return false;
        }

        return trim($process->getOutput()) !== '';
    }

    protected function probeVideoDimensions(string $path): ?array
    {
        static $cache = [];

        if (isset($cache[$path])) {
            return $cache[$path];
        }

        $process = new Process([
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'json',
            $path,
        ]);
        $process->setTimeout(10);
        $process->run();

        if (!$process->isSuccessful()) {
            return $cache[$path] = null;
        }

        $data = json_decode($process->getOutput(), true);
        if (!is_array($data)) {
            return $cache[$path] = null;
        }

        $stream = $data['streams'][0] ?? null;
        $width = (int) ($stream['width'] ?? 0);
        $height = (int) ($stream['height'] ?? 0);

        if ($width > 0 && $height > 0) {
            return $cache[$path] = ['width' => $width, 'height' => $height];
        }

        return $cache[$path] = null;
    }

    protected function ensureAudioTrack(string $inputPath, float $duration): bool
    {
        if ($this->hasAudioStream($inputPath)) {
            return true;
        }

        $tempPath = $inputPath . '.tmpaudio.mp4';
        $args = [
            'ffmpeg',
            '-y',
            '-i', $inputPath,
            '-f', 'lavfi',
            '-t', sprintf('%.3f', max(0.1, $duration)),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-shortest',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ar', '48000',
            $tempPath,
        ];

        if (!$this->runProcess($args)) {
            @unlink($tempPath);
            return false;
        }

        @unlink($inputPath);
        return rename($tempPath, $inputPath);
    }

    protected function prepareClipSegments(Project $project, string $directory): array
    {
        $cleanup = [];
        $segments = [];
        $rawSources = [];
        $hadFailures = false;

        $mediaFiles = collect($project->media_files ?? [])
            ->map(fn ($item) => is_array($item) ? $item : [])
            ->filter()
            ->values();

        $mediaById = $mediaFiles->mapWithKeys(function ($item) {
            $id = Arr::get($item, 'id');

            return $id ? [$id => $item] : [];
        });
        $targetDimensions = null;
        $runningStart = 0.0;

        foreach (($project->clips ?? []) as $index => $clip) {
            if (!is_array($clip)) {
                continue;
            }

            $sourcePath = $this->resolveMediaPath($clip, $mediaById, $directory, 'clip_' . $index, $cleanup);
            if (!$sourcePath) {
                $hadFailures = true;
                continue;
            }

            $rawSources[] = $sourcePath;

            $duration = (float) Arr::get($clip, 'duration', 0);
            if ($duration <= 0) {
                continue;
            }

            $segmentPath = $directory . DIRECTORY_SEPARATOR . 'segment_' . $index . '_' . Str::random(8) . '.mp4';

            $clipType = Arr::get($clip, 'type');
            if ($clipType === 'image') {
                $dimensionsForImage = $targetDimensions ?: ['width' => 1920, 'height' => 1080];
                $dimensionsForImage['width'] = $this->ensureEvenDimension((int) ($dimensionsForImage['width'] ?? 1920));
                $dimensionsForImage['height'] = $this->ensureEvenDimension((int) ($dimensionsForImage['height'] ?? 1080));

                if (!$this->renderImageSegment($sourcePath, $segmentPath, $duration, $dimensionsForImage)) {
                    @unlink($segmentPath);
                    $hadFailures = true;
                    continue;
                }

                if (!$this->ensureAudioTrack($segmentPath, $duration)) {
                    @unlink($segmentPath);
                    $hadFailures = true;
                    continue;
                }

                if (!$targetDimensions) {
                    $targetDimensions = $dimensionsForImage;
                }
            } else {
                $startOffset = max(0.0, (float) Arr::get($clip, 'startOffset', 0));
                $segmentTargetDimensions = $targetDimensions ?: $this->probeVideoDimensions($sourcePath);
                if ($segmentTargetDimensions) {
                    $segmentTargetDimensions['width'] = $this->ensureEvenDimension((int) ($segmentTargetDimensions['width'] ?? 1920));
                    $segmentTargetDimensions['height'] = $this->ensureEvenDimension((int) ($segmentTargetDimensions['height'] ?? 1080));
                }
                if (!$this->trimClipSegment($sourcePath, $segmentPath, $startOffset, $duration, $segmentTargetDimensions ?: $targetDimensions)) {
                    @unlink($segmentPath);
                    $hadFailures = true;
                    continue;
                }

                if (!$this->ensureAudioTrack($segmentPath, $duration)) {
                    @unlink($segmentPath);
                    $hadFailures = true;
                    continue;
                }

                if (!$targetDimensions) {
                    $targetDimensions = $this->probeVideoDimensions($segmentPath) ?? $segmentTargetDimensions;
                }
            }

            if (!$targetDimensions) {
                $targetDimensions = ['width' => 1920, 'height' => 1080];
            }
            $targetDimensions['width'] = $this->ensureEvenDimension((int) ($targetDimensions['width'] ?? 1920));
            $targetDimensions['height'] = $this->ensureEvenDimension((int) ($targetDimensions['height'] ?? 1080));

            $segments[] = [
                'path' => $segmentPath,
                'duration' => $duration,
                'start' => $runningStart,
            ];

            $cleanup[] = $segmentPath;
            $runningStart += $duration;
        }

        return [
            'segments' => $segments,
            'cleanup' => $cleanup,
            'total_duration' => $runningStart,
            'raw_sources' => $rawSources,
            'had_failures' => $hadFailures,
        ];
    }

    protected function buildTransitionMap(Project $project): array
    {
        $map = [];
        foreach (($project->transitions ?? []) as $transition) {
            if (!is_array($transition)) {
                continue;
            }

            $fromIndex = Arr::get($transition, 'from_clip_index');
            $toIndex = Arr::get($transition, 'to_clip_index');
            if (!is_numeric($fromIndex) || !is_numeric($toIndex)) {
                continue;
            }

            $fromIndex = (int) $fromIndex;
            $toIndex = (int) $toIndex;
            if ($toIndex !== $fromIndex + 1) {
                continue;
            }

            $map[$fromIndex] = [
                'type' => Arr::get($transition, 'type', 'fade'),
                'duration' => max(0.1, (float) Arr::get($transition, 'duration', 0.5)),
            ];
        }

        return $map;
    }

    protected function combineSegmentsWithTransitions(array $segments, array $transitionMap, string $directory): array
    {
        if (empty($segments)) {
            return ['path' => null, 'cleanup' => [], 'duration' => 0.0];
        }

        $currentPath = $segments[0]['path'];
        $currentDuration = (float) $segments[0]['duration'];
        $cleanup = [];

        for ($i = 1; $i < count($segments); $i++) {
            $next = $segments[$i];
            $transition = $transitionMap[$i - 1] ?? null;
            $outputPath = $directory . DIRECTORY_SEPARATOR . 'merged_' . $i . '_' . Str::random(8) . '.mp4';

            if ($transition) {
                $transitionDuration = min($transition['duration'], $currentDuration, (float) $next['duration']);
                $offset = max(0.0, $currentDuration - $transitionDuration);
                $xfadeType = match ($transition['type']) {
                    'dip-black' => 'fadeblack',
                    'dip-white' => 'fadewhite',
                    default => 'fade',
                };

                $args = [
                    'ffmpeg',
                    '-y',
                    '-i', $currentPath,
                    '-i', $next['path'],
                    '-filter_complex',
                    sprintf(
                        '[0:v][1:v]xfade=transition=%s:duration=%.3f:offset=%.3f[v];[0:a][1:a]acrossfade=d=%.3f[a]',
                        $xfadeType,
                        $transitionDuration,
                        $offset,
                        $transitionDuration
                    ),
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '20',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    $outputPath,
                ];

                if (!$this->runProcess($args)) {
                    @unlink($outputPath);
                    throw new \RuntimeException('Unable to combine clips with transition.');
                }
                $currentDuration = $currentDuration + (float) $next['duration'] - $transitionDuration;
            } else {
                $args = [
                    'ffmpeg',
                    '-y',
                    '-i', $currentPath,
                    '-i', $next['path'],
                    '-filter_complex',
                    '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '20',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    $outputPath,
                ];

                if (!$this->runProcess($args)) {
                    @unlink($outputPath);
                    throw new \RuntimeException('Unable to concatenate clips for export.');
                }

                $currentDuration += (float) $next['duration'];
            }

            if ($currentPath !== $segments[0]['path']) {
                $cleanup[] = $currentPath;
            }
            $currentPath = $outputPath;
        }

        return ['path' => $currentPath, 'cleanup' => $cleanup, 'duration' => $currentDuration];
    }

    protected function gatherMusicSources(Project $project, string $directory): array
    {
        $cleanup = [];
        $tracks = [];

        $mediaFiles = collect($project->media_files ?? [])
            ->map(fn ($item) => is_array($item) ? $item : [])
            ->filter()
            ->values();

        $mediaById = $mediaFiles->mapWithKeys(function ($item) {
            $id = Arr::get($item, 'id');
            return $id ? [$id => $item] : [];
        });

        foreach (($project->music_tracks ?? []) as $index => $track) {
            if (!is_array($track)) {
                continue;
            }

            $path = $this->resolveMediaPath($track, $mediaById, $directory, 'music_' . $index, $cleanup);
            if (!$path) {
                continue;
            }

            $duration = max(0.1, (float) Arr::get($track, 'duration', 0));
            $startOffset = max(0.0, (float) Arr::get($track, 'startOffset', 0));
            $startTime = max(0.0, (float) Arr::get($track, 'startTime', 0));

            $tracks[] = [
                'path' => $path,
                'duration' => $duration,
                'start_offset' => $startOffset,
                'start_time' => $startTime,
            ];
        }

        return ['tracks' => $tracks, 'cleanup' => $cleanup];
    }

    protected function buildEffectFilters(array $effects): array
    {
        if (empty($effects)) {
            return [];
        }

        $filters = [];
        $currentLabel = 'v0';
        $filters[] = '[0:v]format=yuv420p[' . $currentLabel . ']';
        $counter = 1;

        foreach ($effects as $effect) {
            if (!is_array($effect)) {
                continue;
            }

            $start = max(0.0, (float) Arr::get($effect, 'startTime', 0));
            $duration = max(0.0, (float) Arr::get($effect, 'duration', 0));
            if ($duration <= 0) {
                continue;
            }

            $end = $start + $duration;
            $enable = $this->escapeFilterValue(sprintf('between(t,%.3f,%.3f)', $start, $end));
            $type = Arr::get($effect, 'type', '');
            $intensity = max(0.0, min(1.0, (float) Arr::get($effect, 'intensity', 0.5)));

            $nextLabel = 'v' . $counter++;

            switch ($type) {
                case 'blur':
                    $radius = max(1, (int) round(8 * $intensity));
                    $filters[] = sprintf('[%s]boxblur=luma_radius=%d:luma_power=2:enable=%s[%s]', $currentLabel, $radius, $enable, $nextLabel);
                    break;
                case 'brightness':
                    $brightness = max(-1, min(1, 0.6 * $intensity));
                    $fadeIn = max(0.0, (float) Arr::get($effect, 'fadeIn', 0));
                    $fadeOut = max(0.0, (float) Arr::get($effect, 'fadeOut', 0));

                    $baseLabel = 'v' . $counter++ . 'bbase';
                    $brightLabel = 'v' . $counter++ . 'bbright';
                    $brightAppliedLabel = 'v' . $counter++ . 'bapply';

                    $filters[] = sprintf('[%s]split[%s][%s]', $currentLabel, $baseLabel, $brightLabel);
                    $filters[] = sprintf('[%s]eq=brightness=%0.3f[%s]', $brightLabel, $brightness, $brightAppliedLabel);

                    $alphaSegments = [sprintf('(gte(T,%0.3f)*lte(T,%0.3f))', $start, $end)];
                    if ($fadeIn > 0.0) {
                        $alphaSegments[] = sprintf('min(1,max(0,(T-%0.3f)/%0.3f))', $start, max($fadeIn, 0.001));
                    }
                    if ($fadeOut > 0.0) {
                        $alphaSegments[] = sprintf('min(1,max(0,(%0.3f-T)/%0.3f))', $end, max($fadeOut, 0.001));
                    }
                    $alphaExpr = implode('*', $alphaSegments);
                    $blendExpr = $this->escapeFilterValue(sprintf('A*(1-(%1$s))+B*(%1$s)', $alphaExpr));

                    $filters[] = sprintf(
                        '[%s][%s]blend=all_expr=%s:enable=%s[%s]',
                        $baseLabel,
                        $brightAppliedLabel,
                        $blendExpr,
                        $enable,
                        $nextLabel
                    );
                    break;
                case 'glow':
                    $blurLabel = 'v' . $counter++ . 'b';
                    $glowLabel = 'v' . $counter++ . 'g';
                    $baseLabel = 'v' . $counter++ . 'base';
                    $opacity = max(0.1, min(1.0, $intensity));
                    $filters[] = sprintf('[%s]split=2[%s][%s]', $currentLabel, $baseLabel, $blurLabel);
                    $filters[] = sprintf('[%s]boxblur=luma_radius=20:luma_power=2:enable=%s[%s]', $blurLabel, $enable, $glowLabel);
                    $filters[] = sprintf('[%s][%s]blend=all_mode=screen:all_opacity=%0.3f:enable=%s[%s]', $baseLabel, $glowLabel, $opacity, $enable, $nextLabel);
                    break;
                default:
                    $nextLabel = $currentLabel;
                    break;
            }

            $currentLabel = $nextLabel;
        }

        $filters[] = '[' . $currentLabel . ']format=yuv420p[v_out]';

        return $filters;
    }

    protected function buildTextFilters(array $textOverlays, ?array $videoDimensions = null): array
    {
        if (empty($textOverlays)) {
            return [];
        }

        $filters = [];
        $currentLabel = 'v_out';
        $counter = 0;
        $fontPath = $this->resolveDefaultFontPath();
        $fontDirective = $fontPath
            ? 'fontfile=' . $this->quoteFilterValue($fontPath)
            : 'font=DejaVuSans';

        foreach ($textOverlays as $index => $overlay) {
            if (!is_array($overlay)) {
                continue;
            }

            $start = max(0.0, (float) Arr::get($overlay, 'startTime', 0));
            $duration = max(0.0, (float) Arr::get($overlay, 'duration', 0));
            if ($duration <= 0) {
                continue;
            }

            $end = $start + $duration;
            $enable = $this->escapeFilterValue(sprintf('between(t,%.3f,%.3f)', $start, $end));
            $text = Arr::get($overlay, 'content', '');
            if ($text === '') {
                continue;
            }

            $quotedText = $this->quoteFilterValue($text);
            $color = ltrim((string) Arr::get($overlay, 'color', '#FCFFFC'), '#');
            if (!preg_match('/^[0-9a-fA-F]{6}$/', $color)) {
                $color = 'FCFFFC';
            }
            $fontSize = (float) Arr::get($overlay, 'fontSize', 32);
            $canvasHeight = (float) Arr::get($overlay, 'canvasHeight', 0);
            $canvasWidth = (float) Arr::get($overlay, 'canvasWidth', 0);
            $displayVideoWidth = (float) Arr::get($overlay, 'displayVideoWidth', $canvasWidth);
            $displayVideoHeight = (float) Arr::get($overlay, 'displayVideoHeight', $canvasHeight);
            $displayOffsetX = (float) Arr::get($overlay, 'displayVideoOffsetX', max(0.0, ($canvasWidth - $displayVideoWidth) / 2));
            $displayOffsetY = (float) Arr::get($overlay, 'displayVideoOffsetY', max(0.0, ($canvasHeight - $displayVideoHeight) / 2));

            $scaleApplied = null;
            if (is_array($videoDimensions)) {
                $videoWidth = (float) ($videoDimensions['width'] ?? 0);
                $videoHeight = (float) ($videoDimensions['height'] ?? 0);

                if ($displayVideoHeight > 0 && $videoHeight > 0) {
                    $fontSize *= $videoHeight / $displayVideoHeight;
                    $scaleApplied = 'height';
                } elseif ($displayVideoWidth > 0 && $videoWidth > 0) {
                    $fontSize *= $videoWidth / $displayVideoWidth;
                    $scaleApplied = 'width';
                }
            }

            if ($displayVideoHeight <= 0 && $displayVideoWidth <= 0 && is_array($videoDimensions)) {
                $fallbackHeight = (float) ($videoDimensions['height'] ?? 0);
                if ($fallbackHeight > 0) {
                    $fontSize *= max(1.0, $fallbackHeight / 720.0);
                    $scaleApplied = 'fallback';
                }
            }

            $fontSize = max(10, (int) round($fontSize));
            $stageWidth = $canvasWidth > 0 ? $canvasWidth : max($displayVideoWidth, 1);
            $stageHeight = $canvasHeight > 0 ? $canvasHeight : max($displayVideoHeight, 1);

            $displayWidthSafe = $displayVideoWidth > 0 ? $displayVideoWidth : $stageWidth;
            $displayHeightSafe = $displayVideoHeight > 0 ? $displayVideoHeight : $stageHeight;

            $stagePercentXMeta = Arr::get($overlay, 'stagePercentX');
            $stagePercentYMeta = Arr::get($overlay, 'stagePercentY');
            $stagePercentX = is_numeric($stagePercentXMeta)
                ? max(0, min(100, (float) $stagePercentXMeta))
                : max(0, min(100, (float) Arr::get($overlay, 'x', 50)));
            $stagePercentY = is_numeric($stagePercentYMeta)
                ? max(0, min(100, (float) $stagePercentYMeta))
                : max(0, min(100, (float) Arr::get($overlay, 'y', 50)));

            $stagePosX = ($stagePercentX / 100) * $stageWidth;
            $stagePosY = ($stagePercentY / 100) * $stageHeight;

            $videoPercentX = $displayWidthSafe > 0
                ? (($stagePosX - $displayOffsetX) / $displayWidthSafe) * 100
                : max(0, min(100, (float) Arr::get($overlay, 'x', 50)));
            $videoPercentY = $displayHeightSafe > 0
                ? (($stagePosY - $displayOffsetY) / $displayHeightSafe) * 100
                : max(0, min(100, (float) Arr::get($overlay, 'y', 50)));

            $videoPercentX = max(0, min(100, $videoPercentX));
            $videoPercentY = max(0, min(100, $videoPercentY));

            $videoRatioX = $videoPercentX / 100;
            $videoRatioY = $videoPercentY / 100;

            $xExpr = sprintf('(w*%0.6f)-(text_w/2)', $videoRatioX);
            $yExpr = sprintf('(h*%0.6f)-(text_h/2)', $videoRatioY);

            $nextLabel = 'v_text_' . $counter++;
            $drawtextOptions = [
                'text=' . $quotedText,
                $fontDirective,
                'fontcolor=0x' . strtoupper($color),
                'fontsize=' . $fontSize,
                'x=' . $this->escapeFilterValue($xExpr),
                'y=' . $this->escapeFilterValue($yExpr),
                'enable=' . $enable,
            ];
            $filters[] = sprintf(
                '[%s]drawtext=%s[%s]',
                $currentLabel,
                implode(':', $drawtextOptions),
                $nextLabel
            );
            $currentLabel = $nextLabel;

            Log::debug('Export text overlay', [
                'overlay_index' => $index,
                'content_preview' => Str::limit($text, 40),
                'font_size_final' => $fontSize,
                'scale_applied' => $scaleApplied,
                'canvas_width' => $canvasWidth,
                'canvas_height' => $canvasHeight,
                'display_video_width' => $displayVideoWidth,
                'display_video_height' => $displayVideoHeight,
                'display_video_offset_x' => $displayOffsetX,
                'display_video_offset_y' => $displayOffsetY,
                'video_dimensions' => $videoDimensions,
                'position_percent' => [
                    'video' => ['x' => $videoPercentX, 'y' => $videoPercentY],
                    'stage' => ['x' => $stagePercentX, 'y' => $stagePercentY],
                ],
            ]);
        }

        $filters[] = '[' . $currentLabel . ']format=yuv420p[video_export]';

        return $filters;
    }

    protected function applyTimelineOverlays(
        string $inputPath,
        string $outputPath,
        array $effects,
        array $textOverlays,
        array $musicTracks,
        bool $hasBaseAudio
    ): bool {
        $needsEffects = !empty($effects);
        $needsText = !empty($textOverlays);
        $needsMusic = !empty($musicTracks);

        if (!$needsEffects && !$needsText && !$needsMusic) {
            return copy($inputPath, $outputPath);
        }

        $args = ['ffmpeg', '-y', '-i', $inputPath];
        foreach ($musicTracks as $track) {
            $args[] = '-i';
            $args[] = $track['path'];
        }

        $filterLines = [];
        $videoDimensions = $this->probeVideoDimensions($inputPath);

        $effectFilters = $this->buildEffectFilters($effects);
        if (!empty($effectFilters)) {
            $filterLines = array_merge($filterLines, $effectFilters);
        } else {
            $filterLines[] = '[0:v]format=yuv420p[v_out]';
        }


        $textFilters = $this->buildTextFilters($textOverlays, $videoDimensions);
        if (!empty($textFilters)) {
            $filterLines = array_merge($filterLines, $textFilters);
        } else {
            $filterLines[] = '[v_out]format=yuv420p[video_export]';
        }

        $audioFilters = [];
        $audioLabels = [];
        $audioOutputLabel = null;
        if ($needsMusic || $hasBaseAudio) {
            if ($hasBaseAudio) {
                $audioFilters[] = '[0:a]aresample=async=1,apad[a_base]';
                $audioLabels[] = 'a_base';
            }

            foreach ($musicTracks as $index => $track) {
                $inputIndex = $index + 1;
                $startOffset = max(0.0, (float) $track['start_offset']);
                $startTime = max(0.0, (float) $track['start_time']);
                $duration = max(0.0, (float) $track['duration']);
                if ($duration <= 0) {
                    continue;
                }

                $endOffset = $startOffset + $duration;
                $delayMs = (int) round($startTime * 1000);
                $label = 'a_track_' . $index;

                $audioFilters[] = sprintf(
                    '[%d:a]atrim=start=%0.3f:end=%0.3f,asetpts=PTS-STARTPTS,adelay=%d|%d,apad[%s]',
                    $inputIndex,
                    $startOffset,
                    $endOffset,
                    $delayMs,
                    $delayMs,
                    $label
                );
                $audioLabels[] = $label;
            }

            if (!empty($audioLabels)) {
                $audioOutputLabel = 'audio_mix';
                $audioFilters[] = implode('', array_map(fn ($label) => '[' . $label . ']', $audioLabels))
                    . 'amix=inputs=' . count($audioLabels) . ':normalize=0[' . $audioOutputLabel . ']';
            }
        }
        if (!empty($audioFilters)) {
            $filterLines = array_merge($filterLines, $audioFilters);
        }

        if (!empty($filterLines)) {
            $args[] = '-filter_complex';
            $args[] = implode(';', $filterLines);
        }

        $args[] = '-map';
        $args[] = '[video_export]';

        if ($audioOutputLabel) {
            $args[] = '-map';
            $args[] = '[' . $audioOutputLabel . ']';
        } elseif ($hasBaseAudio && !$needsMusic) {
            $args[] = '-map';
            $args[] = '0:a';
        } else {
            $args[] = '-an';
        }


        $args = array_merge($args, [
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
        ]);

        if ($audioOutputLabel || ($hasBaseAudio && !$needsMusic)) {
            $args = array_merge($args, ['-c:a', 'aac', '-b:a', '192k']);
        }

        $args[] = '-movflags';
        $args[] = '+faststart';
        $args[] = '-shortest';
        $args[] = $outputPath;

        return $this->runProcess($args);
    }

    public function download(Request $request, Project $project)
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        @ini_set('max_execution_time', '0');

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
        $videoFileName = $fileSafeName
            ? $fileSafeName . "-{$timestamp}-{$exportId}.mp4"
            : "quickcut-project-{$timestamp}-{$exportId}.mp4";
        $videoPath = $directory . DIRECTORY_SEPARATOR . $videoFileName;

        $prepared = $this->prepareClipSegments($project, $directory);
        $segments = $prepared['segments'];
        $rawSources = $prepared['raw_sources'] ?? [];

        if (empty($segments) && empty($rawSources)) {

            abort(422, 'This project does not contain any video clips to export.');
        }

        $cleanup = $prepared['cleanup'] ?? [];
        $intermediate = null;
        $basePath = null;
        $hasBaseAudio = false;

        try {
            if (!empty($segments)) {
                $transitionMap = $this->buildTransitionMap($project);
                $combined = $this->combineSegmentsWithTransitions($segments, $transitionMap, $directory);
                $intermediate = $combined['path'];
                $cleanup = array_merge($cleanup, $combined['cleanup']);
                $basePath = $intermediate;
            } else {
                $basePath = $rawSources[0];
            }

            if (!$basePath || !file_exists($basePath)) {
                abort(500, 'Unable to build video export.');
            }

            $hasBaseAudio = $this->hasAudioStream($basePath);

            $music = $this->gatherMusicSources($project, $directory);
            $cleanup = array_merge($cleanup, $music['cleanup']);

            if (!$this->applyTimelineOverlays(
                $basePath,
                $videoPath,
                is_array($project->effects) ? $project->effects : [],
                is_array($project->text_overlays) ? $project->text_overlays : [],
                $music['tracks'] ?? [],
                $hasBaseAudio
            )) {
                abort(500, 'Unable to build video export.');
            }
        } finally {
            foreach ($cleanup as $tempPath) {
                if (is_string($tempPath) && $tempPath && file_exists($tempPath)) {
                    @unlink($tempPath);
                }
            }
            if ($intermediate && file_exists($intermediate) && $intermediate !== $videoPath) {
                @unlink($intermediate);
            }
        }

        if (!file_exists($videoPath)) {
            abort(500, 'Unable to build video export.');
        }

        $downloadName = $fileSafeName ? $fileSafeName . '-quickcut-export.mp4' : 'quickcut-export.mp4';
        $fileSize = @filesize($videoPath) ?: null;

        $response = response()->streamDownload(function () use ($videoPath) {
            $handle = @fopen($videoPath, 'rb');
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
                @unlink($videoPath);
            }
        }, $downloadName, array_filter([
            'Content-Type' => 'video/mp4',
            'Content-Length' => $fileSize,
        ]));

        if ($fileSize !== null) {
            $response->headers->set('Accept-Ranges', 'bytes');
        }

        return $response;
    }
}
