<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Export as ExportModel;
use App\Jobs\ProcessProjectExport;
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
    $expiresAt = $lastSavedAt->copy()->addSeconds($recentWindow);
    $secondsSinceSave = max(0, $lastSavedAt->diffInSeconds(now()));
    $allowed = now()->lte($expiresAt);

    return [
        'allowed' => $allowed,
        'recent_window_seconds' => $recentWindow,
        'seconds_since_save' => $secondsSinceSave,
        'last_saved_at' => $lastSavedAt->toIso8601String(),
        'export_expires_at' => $expiresAt->toIso8601String(),
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

        $candidates = [
            // Linux
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            // macOS system
            '/System/Library/Fonts/Supplemental/Arial.ttf',
            '/Library/Fonts/Arial.ttf',
            '/System/Library/Fonts/Helvetica.ttc',
            '/System/Library/Fonts/SFNSText.ttf',
            '/System/Library/Fonts/SFNS.ttf',
            '/System/Library/Fonts/Supplemental/Verdana.ttf',
        ];

        foreach ($candidates as $candidate) {
            if (file_exists($candidate)) {
                return $cached = $candidate;
            }
        }

        return $cached = null;
    }

protected function escapeFilterValue(string $value): string
{
    $escaped = strtr($value, [
        '\\' => '\\\\',
        ':'  => '\\:',
        '='  => '\\=',
        ' '  => '\\ ',
        "'"  => "\\'",
        '['  => '\\[',
        ']'  => '\\]',
        ','  => '\\,',
        ';'  => '\\;',
        '%'  => '\\%',
        "\r" => '',
    ]);

    return str_replace("\n", '\\n', $escaped);
}


    protected function quoteFilterValue(string $value): string
    {
        return "'" . $this->escapeFilterValue($value) . "'";
    }

    protected function resolveBinary(string $configured, array $fallbacks, string $default): string
    {
        static $cache = [];
        $cacheKey = $configured . '|' . implode(',', $fallbacks) . '|' . $default;

        if (isset($cache[$cacheKey])) {
            return $cache[$cacheKey];
        }

        $candidates = [];
        if (is_string($configured) && $configured !== '') {
            $candidates[] = $configured;
        }
        $candidates = array_merge($candidates, $fallbacks);
        $candidates[] = $default;

        foreach ($candidates as $candidate) {
            if (!is_string($candidate) || $candidate === '') {
                continue;
            }
            if (str_contains($candidate, '/') || str_contains($candidate, '\\')) {
                if (@is_file($candidate) && @is_executable($candidate)) {
                    return $cache[$cacheKey] = $candidate;
                }
            } else {
                try {
                    $which = new Process(['which', $candidate]);
                    $which->setTimeout(1);
                    $which->run();
                    if ($which->isSuccessful()) {
                        $path = trim($which->getOutput());
                        if ($path !== '') {
                            return $cache[$cacheKey] = $path;
                        }
                    }
                } catch (\Throwable $e) {
                    // Ignore lookup failure and continue to next candidate.
                }
            }
        }

        return $cache[$cacheKey] = $default;
    }

    protected function ffmpegBinary(): string
    {
        $configured = (string) config('quickcut.export.ffmpeg_path', '');
        $fallbacks = [
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/bin/ffmpeg',
            '/opt/homebrew/bin/ffmpeg',
            'C:/ffmpeg/bin/ffmpeg.exe',
        ];

        return $this->resolveBinary($configured, $fallbacks, 'ffmpeg');
    }

    protected function ffprobeBinary(): string
    {
        $configured = (string) config('quickcut.export.ffprobe_path', '');
        $fallbacks = [
            '/usr/bin/ffprobe',
            '/usr/local/bin/ffprobe',
            '/bin/ffprobe',
            '/opt/homebrew/bin/ffprobe',
            'C:/ffmpeg/bin/ffprobe.exe',
        ];

        return $this->resolveBinary($configured, $fallbacks, 'ffprobe');
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
    if (!empty($arguments)) {
        if ($arguments[0] === 'ffmpeg') {
            $arguments[0] = $this->ffmpegBinary();
        } elseif ($arguments[0] === 'ffprobe') {
            $arguments[0] = $this->ffprobeBinary();
        }
    }

    $process = new Process($arguments);
    $process->setTimeout($this->processTimeout());
    $process->run();

    if ($process->isSuccessful()) {
        return true;
    }

    Log::warning('FFmpeg command failed during export.', [
        'command' => $process->getCommandLine(),
        'output'  => $process->getErrorOutput(),
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
            $this->ffmpegBinary(),
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
        $args = [$this->ffmpegBinary(), '-y'];
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
            $this->ffprobeBinary(),
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
            $this->ffprobeBinary(),
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
            $this->ffmpegBinary(),
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
        $this->ensureOutputDirectory($directory);

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


protected function processTimeout(): int
{
    return (int) config('quickcut.export.process_timeout', 1800);
}

protected function isAllowedUrl(string $url): bool
{
    $parsed = parse_url($url);
    if (!in_array(strtolower($parsed['scheme'] ?? ''), ['http', 'https'], true)) {
        return false;
    }
    $host = strtolower($parsed['host'] ?? '');
    if ($host === '') return false;

    $whitelist = array_map('strtolower', (array) config('quickcut.export.allowed_asset_hosts', []));
    return in_array($host, $whitelist, true);
}

protected function downloadToTemp(string $url, string $directory, string $prefix): ?string
{
    if (!$this->isAllowedUrl($url)) {
        Log::warning('Blocked remote media download: host not allowed', ['url' => $url]);
        return null;
    }

    $maxBytes = (int) config('quickcut.export.remote_download_max_bytes', 50_000_000);
    $response = Http::timeout(20)->withOptions(['stream' => true])->get($url);
    if (!$response->ok()) return null;

    $tmpPath = $directory . DIRECTORY_SEPARATOR . $prefix . '_' . Str::random(6);
    $fh = @fopen($tmpPath, 'wb');
    if (!$fh) return null;

    $received = 0;
    try {
        foreach ($response->body() as $chunk) {
            $received += strlen($chunk);
            if ($received > $maxBytes) {
                Log::warning('Remote media exceeded size cap', ['url' => $url, 'cap' => $maxBytes]);
                fclose($fh);
                @unlink($tmpPath);
                return null;
            }
            fwrite($fh, $chunk);
        }
    } catch (\Throwable $e) {
        fclose($fh);
        @unlink($tmpPath);
        return null;
    }
    fclose($fh);
    return $tmpPath;
}


    protected function buildTransitionMap(Project $project): array
    {
        $map = [];
        $clips = collect($project->clips ?? [])
            ->map(fn ($clip) => is_array($clip) ? $clip : [])
            ->values();

        $indexLookup = [];
        foreach ($clips as $index => $clip) {
            $candidates = [
                Arr::get($clip, '_localId'),
                Arr::get($clip, 'localId'),
                Arr::get($clip, 'local_id'),
                Arr::get($clip, 'id'),
                Arr::get($clip, 'clip_id'),
                Arr::get($clip, 'storageKey'),
                'index-' . $index,
            ];
            foreach ($candidates as $candidate) {
                if (is_string($candidate) && $candidate !== '') {
                    $indexLookup[$candidate] = $index;
                } elseif (is_numeric($candidate)) {
                    $indexLookup[(string) $candidate] = $index;
                }
            }
        }

        foreach (($project->transitions ?? []) as $transition) {
            if (!is_array($transition)) {
                continue;
            }

            $fromIndex = Arr::get($transition, 'from_clip_index', Arr::get($transition, 'fromClipIndex'));
            $toIndex = Arr::get($transition, 'to_clip_index', Arr::get($transition, 'toClipIndex'));

            $resolveIndex = function ($value, array $lookup) {
                if (is_numeric($value)) {
                    return (int) $value;
                }
                if (is_string($value) && $value !== '') {
                    if (isset($lookup[$value])) {
                        return $lookup[$value];
                    }
                    if (isset($lookup[(string) $value])) {
                        return $lookup[(string) $value];
                    }
                }
                return null;
            };

            if (!is_numeric($fromIndex)) {
                $fromCandidates = [
                    Arr::get($transition, 'from_clip_local_id'),
                    Arr::get($transition, 'fromClipLocalId'),
                    Arr::get($transition, 'from_clip_id'),
                    Arr::get($transition, 'fromClipId'),
                    Arr::get($transition, 'from_clip_storage_key'),
                    Arr::get($transition, 'fromClipStorageKey'),
                ];
                foreach ($fromCandidates as $candidate) {
                    $fromIndex = $resolveIndex($candidate, $indexLookup);
                    if ($fromIndex !== null) {
                        break;
                    }
                }
            } else {
                $fromIndex = (int) $fromIndex;
            }

            if (!is_numeric($toIndex)) {
                $toCandidates = [
                    Arr::get($transition, 'to_clip_local_id'),
                    Arr::get($transition, 'toClipLocalId'),
                    Arr::get($transition, 'to_clip_id'),
                    Arr::get($transition, 'toClipId'),
                    Arr::get($transition, 'to_clip_storage_key'),
                    Arr::get($transition, 'toClipStorageKey'),
                ];
                foreach ($toCandidates as $candidate) {
                    $toIndex = $resolveIndex($candidate, $indexLookup);
                    if ($toIndex !== null) {
                        break;
                    }
                }
            } else {
                $toIndex = (int) $toIndex;
            }

            if ($fromIndex === null || $toIndex === null) {
                Log::debug('Skipping transition without resolvable clip indexes.', [
                    'transition' => $transition,
                ]);
                continue;
            }

            if ($toIndex !== $fromIndex + 1) {
                Log::debug('Transition target is not adjacent; skipping.', [
                    'transition' => $transition,
                    'from_index' => $fromIndex,
                    'to_index' => $toIndex,
                ]);
                continue;
            }

            $map[$fromIndex] = [
                'type' => Arr::get($transition, 'type', 'fade'),
                'duration' => max(0.1, (float) Arr::get($transition, 'duration', 0.5)),
            ];
        }

        return $map;
    }

    protected function quoteConcatDemuxerPath(string $path): string
    {
        $escaped = str_replace(['\\', "'"], ['\\\\', "\\'"], $path);

        return "'" . $escaped . "'";
    }

    /**
     * @param array<int, array{path: string, duration?: float|int|string}> $segments
     */
    protected function writeConcatListFile(array $segments, string $directory): string
    {
        $listPath = $directory . DIRECTORY_SEPARATOR . 'concat_' . Str::random(8) . '.txt';
        $lines = [];

        foreach ($segments as $segment) {
            $path = $segment['path'] ?? null;
            if (!is_string($path) || $path === '') {
                continue;
            }

            $lines[] = 'file ' . $this->quoteConcatDemuxerPath($path);
        }

        file_put_contents($listPath, implode("\n", $lines) . "\n");

        return $listPath;
    }

    protected function combineSegmentsWithTransitionsSequential(array $segments, array $transitionMap, string $directory): array
    {
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
                    $this->ffmpegBinary(),
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
                    $this->ffmpegBinary(),
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

    protected function combineSegmentsWithTransitions(array $segments, array $transitionMap, string $directory): array
    {
        if (empty($segments)) {
            return ['path' => null, 'cleanup' => [], 'duration' => 0.0];
        }

        if (count($segments) === 1) {
            return [
                'path' => $segments[0]['path'],
                'cleanup' => [],
                'duration' => (float) $segments[0]['duration'],
            ];
        }

        $hasTransitions = !empty($transitionMap);
        if (!$hasTransitions) {
            $concatOutputPath = $directory . DIRECTORY_SEPARATOR . 'merged_concat_' . Str::random(8) . '.mp4';
            $listPath = $this->writeConcatListFile($segments, $directory);

            $args = [
                $this->ffmpegBinary(),
                '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', $listPath,
                '-c', 'copy',
                '-movflags', '+faststart',
                $concatOutputPath,
            ];

            if ($this->runProcess($args) && file_exists($concatOutputPath)) {
                $duration = 0.0;
                foreach ($segments as $segment) {
                    $duration += (float) ($segment['duration'] ?? 0);
                }

                return [
                    'path' => $concatOutputPath,
                    'cleanup' => [$listPath],
                    'duration' => $duration,
                ];
            }

            @unlink($concatOutputPath);
            @unlink($listPath);
        }

        // Single-pass combine (1 encode) with transitions/concats, falling back to sequential if needed.
        $outputPath = $directory . DIRECTORY_SEPARATOR . 'merged_' . count($segments) . '_' . Str::random(8) . '.mp4';

        $args = [$this->ffmpegBinary(), '-y'];
        foreach ($segments as $segment) {
            $args[] = '-i';
            $args[] = $segment['path'];
        }

        $filters = [];
        foreach ($segments as $index => $segment) {
            $filters[] = sprintf('[%d:v]format=yuv420p,setpts=PTS-STARTPTS[v%d]', $index, $index);
            $filters[] = sprintf('[%d:a]aresample=async=1:sample_rate=48000,asetpts=PTS-STARTPTS[a%d]', $index, $index);
        }

        $vCurrent = 'v0';
        $aCurrent = 'a0';
        $currentDuration = (float) ($segments[0]['duration'] ?? 0.0);

        for ($i = 1; $i < count($segments); $i++) {
            $nextDuration = (float) ($segments[$i]['duration'] ?? 0.0);
            $transition = $transitionMap[$i - 1] ?? null;

            if ($transition) {
                $transitionDuration = min((float) $transition['duration'], $currentDuration, $nextDuration);
                $offset = max(0.0, $currentDuration - $transitionDuration);
                $xfadeType = match ($transition['type']) {
                    'dip-black' => 'fadeblack',
                    'dip-white' => 'fadewhite',
                    default => 'fade',
                };

                $vOut = 'vxf_' . $i;
                $aOut = 'axf_' . $i;

                $filters[] = sprintf(
                    '[%s][v%d]xfade=transition=%s:duration=%.3f:offset=%.3f[%s]',
                    $vCurrent,
                    $i,
                    $xfadeType,
                    $transitionDuration,
                    $offset,
                    $vOut
                );
                $filters[] = sprintf(
                    '[%s][a%d]acrossfade=d=%.3f[%s]',
                    $aCurrent,
                    $i,
                    $transitionDuration,
                    $aOut
                );

                $vCurrent = $vOut;
                $aCurrent = $aOut;
                $currentDuration = $currentDuration + $nextDuration - $transitionDuration;
                continue;
            }

            $vOut = 'vcat_' . $i;
            $aOut = 'acat_' . $i;

            $filters[] = sprintf(
                '[%s][%s][v%d][a%d]concat=n=2:v=1:a=1[%s][%s]',
                $vCurrent,
                $aCurrent,
                $i,
                $i,
                $vOut,
                $aOut
            );

            $vCurrent = $vOut;
            $aCurrent = $aOut;
            $currentDuration += $nextDuration;
        }

        $finalVideo = $vCurrent;
        if ($finalVideo !== 'video_combined') {
            $filters[] = sprintf('[%s]format=yuv420p[video_combined]', $finalVideo);
            $finalVideo = 'video_combined';
        }

        $args[] = '-filter_complex';
        $args[] = implode(';', $filters);
        $args[] = '-map';
        $args[] = '[' . $finalVideo . ']';
        $args[] = '-map';
        $args[] = '[' . $aCurrent . ']';
        $args = array_merge($args, [
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            $outputPath,
        ]);

        if ($this->runProcess($args) && file_exists($outputPath)) {
            return ['path' => $outputPath, 'cleanup' => [], 'duration' => $currentDuration];
        }

        @unlink($outputPath);

        return $this->combineSegmentsWithTransitionsSequential($segments, $transitionMap, $directory);
    }

    protected function gatherMusicSources(Project $project, string $directory): array
    {
        $this->ensureOutputDirectory($directory);

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

    /**
     * Write overlay text to temp files to avoid filter escaping issues (e.g. `;`, `:`).
     *
     * @param array<int, mixed> $textOverlays
     * @return array{overlays: array<int, mixed>, cleanup: array<int, string>}
     */
    protected function prepareTextOverlayFiles(array $textOverlays, string $directory): array
    {
        $this->ensureOutputDirectory($directory);

        $cleanup = [];
        $overlays = [];

        foreach ($textOverlays as $index => $overlay) {
            if (!is_array($overlay)) {
                $overlays[] = $overlay;
                continue;
            }

            $text = Arr::get($overlay, 'content', '');
            if (!is_string($text) || $text === '') {
                $overlays[] = $overlay;
                continue;
            }

            $path = $directory . DIRECTORY_SEPARATOR . 'text_' . $index . '_' . Str::random(8) . '.txt';
            $written = @file_put_contents($path, $text);
            if ($written === false) {
                $overlays[] = $overlay;
                continue;
            }

            $overlay['_textfile'] = $path;
            $cleanup[] = $path;
            $overlays[] = $overlay;
        }

        return [
            'overlays' => $overlays,
            'cleanup' => $cleanup,
        ];
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

        $textFile = Arr::get($overlay, '_textfile');
        $textDirective = (is_string($textFile) && $textFile !== '' && file_exists($textFile))
            ? 'textfile=' . $this->quoteFilterValue($textFile)
            : 'text=' . $this->quoteFilterValue($text);
        $color = ltrim((string) Arr::get($overlay, 'color', '#FCFFFC'), '#');
        if (!preg_match('/^[0-9a-fA-F]{6}$/', $color)) {
            $color = 'FCFFFC';
        }


        $fontSize = (float) Arr::get($overlay, 'fontSize', 32);
        $canvasHeight = (float) Arr::get($overlay, 'canvasHeight', 0);
        $canvasWidth  = (float) Arr::get($overlay, 'canvasWidth', 0);
        $displayVideoWidth  = (float) Arr::get($overlay, 'displayVideoWidth', $canvasWidth);
        $displayVideoHeight = (float) Arr::get($overlay, 'displayVideoHeight', $canvasHeight);

        $scaleApplied = null;
        if (is_array($videoDimensions)) {
            $videoWidth  = (float) ($videoDimensions['width'] ?? 0);
            $videoHeight = (float) ($videoDimensions['height'] ?? 0);
            $sx = ($displayVideoWidth  > 0 && $videoWidth  > 0) ? ($videoWidth  / $displayVideoWidth)  : null;
            $sy = ($displayVideoHeight > 0 && $videoHeight > 0) ? ($videoHeight / $displayVideoHeight) : null;

            if ($sx && $sy) {
                $fontSize *= min($sx, $sy);
                $scaleApplied = 'xy-min';
            } elseif ($sy) {
                $fontSize *= $sy;
                $scaleApplied = 'height';
            } elseif ($sx) {
                $fontSize *= $sx;
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

        $fontSize = (int) max(10, min(300, round($fontSize)));

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


        $displayOffsetX = (float) Arr::get($overlay, 'displayVideoOffsetX', 0);
        $displayOffsetY = (float) Arr::get($overlay, 'displayVideoOffsetY', 0);

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
            $textDirective,
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

        $textCleanup = [];
        if ($needsText) {
            $prepared = $this->prepareTextOverlayFiles($textOverlays, dirname($outputPath));
            $textOverlays = $prepared['overlays'] ?? $textOverlays;
            $textCleanup = $prepared['cleanup'] ?? [];
        }

        try {
            $args = [$this->ffmpegBinary(), '-y', '-i', $inputPath];
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
$audioLabels  = [];
$audioOutputLabel = null;

if ($needsMusic || $hasBaseAudio) {
    if ($hasBaseAudio) {
        $audioFilters[] = '[0:a]aresample=async=1:sample_rate=48000,apad[a_base]';
        $audioLabels[] = 'a_base';
    }

    foreach ($musicTracks as $index => $track) {
        $inputIndex  = $index + 1;
        $startOffset = max(0.0, (float) $track['start_offset']);
        $startTime   = max(0.0, (float) $track['start_time']);
        $duration    = max(0.0, (float) $track['duration']);
        if ($duration <= 0) continue;

        $endOffset = $startOffset + $duration;
        $delayMs   = (int) round($startTime * 1000);
        $label     = 'a_track_' . $index;

        $audioFilters[] = sprintf(
            '[%d:a]aresample=async=1:sample_rate=48000,atrim=start=%0.3f:end=%0.3f,' .
            'asetpts=PTS-STARTPTS,adelay=%d|%d,apad[%s]',
            $inputIndex, $startOffset, $endOffset, $delayMs, $delayMs, $label
        );
        $audioLabels[] = $label;
    }

    if (!empty($audioLabels)) {
        $audioOutputLabel = 'audio_mix';
        $audioFilters[] = implode('', array_map(fn ($l) => '['.$l.']', $audioLabels))
            . 'amix=inputs=' . count($audioLabels) . ':normalize=1[' . $audioOutputLabel . ']';
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
        } finally {
            foreach ($textCleanup as $path) {
                if (is_string($path) && $path !== '' && file_exists($path)) {
                    @unlink($path);
                }
            }
        }
    }

public function download(Request $request, Project $project)
{
    if (function_exists('set_time_limit')) {
        @set_time_limit(0);
    }

    /**
     * Download a completed export file for the given project.
     * If an export id is provided via query `export_id` it will attempt to download that export,
     * otherwise it will locate the most recent completed export for the project and current user.
     */
    public function downloadFile(Request $request, Project $project)
    {
        $this->ensureOwner($project);

        $exportId = $request->query('export_id');

        if ($exportId) {
            $export = ExportModel::where('id', $exportId)->where('project_id', $project->id)->first();
        } else {
            $export = ExportModel::where('project_id', $project->id)
                ->when(optional(auth()->user())->id, fn ($q, $userId) => $q->where('user_id', $userId))
                ->where('status', 'completed')
                ->orderByDesc('created_at')
                ->first();
        }

        if (!$export) {
            return response()->json([
                'code' => 'EXPORT_NOT_FOUND',
                'message' => 'No completed export found for this project.',
            ], 404);
        }

        if ($export->status !== 'completed') {
            return response()->json([
                'code' => 'EXPORT_NOT_READY',
                'message' => 'Export is not yet ready for download.',
                'status' => $export->status,
            ], 409);
        }

        $videoPath = $export->file_path;
        if (!$videoPath || !file_exists($videoPath)) {
            return response()->json([
                'code' => 'MISSING_OUTPUT',
                'message' => 'Export file is missing on disk.',
            ], 500);
        }

        $downloadName = $export->file_name ?: (basename($videoPath) ?: 'quickcut-export.mp4');
        $fileSize = @filesize($videoPath) ?: null;

        // Stream the file; delete after streaming and mark export as downloaded
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
            'Content-Type'   => 'video/mp4',
            'Content-Length' => $fileSize,
        ]));

        // mark as downloaded
        $export->status = 'downloaded';
        $export->save();

        if ($fileSize !== null) {
            $response->headers->set('Accept-Ranges', 'bytes');
        }
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }
    @ini_set('max_execution_time', '0');

    $this->ensureOwner($project);

    // Always compute window so we can include it in any error response
    $window = $this->buildWindowData($project);

    // Gate: must be recently saved
    if (!$window['allowed'] && !$request->boolean('force')) {
        return response()->json([
            'code'         => 'RECENT_SAVE_REQUIRED',
            'message'      => 'Please save your project in the editor before exporting.',
            'exportWindow' => $window,
        ], 409);
    }

    $exportId  = Str::uuid()->toString();
    $directory = storage_path('app/exports');

    $fileSafeName  = Str::slug($project->name ?: 'quickcut-project');
    $timestamp     = now()->format('Ymd_His');
    $videoFileName = $fileSafeName
        ? $fileSafeName . "-{$timestamp}-{$exportId}.mp4"
        : "quickcut-project-{$timestamp}-{$exportId}.mp4";

    // Create Export record
    $export = ExportModel::create([
        'uuid' => $exportId,
        'project_id' => $project->id,
        'user_id' => optional(auth()->user())->id,
        'status' => 'pending',
        'file_name' => $videoFileName,
    ]);

    // Dispatch background job to actually build the export
    ProcessProjectExport::dispatch($export->id);

    return response()->json([
        'message' => 'Export queued',
        'export' => [
            'id' => $export->id,
            'uuid' => $export->uuid,
            'status' => $export->status,
        ],
        'exportWindow' => $window,
    ], 202);
}

/**
 * Build the export file for a background job. This extracts the main export pipeline
 * that previously lived inside download(). It writes the output file to
 * storage_path('app/exports'). Returns an array with videoPath and fileName on success.
 *
 * Note: This method throws exceptions on error which the job will catch and record.
 */
public function buildExportForJob(Project $project, string $exportUuid, string $videoFileName): array
{
    $directory = storage_path('app/exports');
    $videoPath     = '';
    $intermediate  = null;
    $cleanup       = [];

    $this->ensureOutputDirectory($directory);

    $videoPath = $directory . DIRECTORY_SEPARATOR . $videoFileName;

    // Prepare clips
    $prepared    = $this->prepareClipSegments($project, $directory);
    $segments    = $prepared['segments'] ?? [];
    $rawSources  = $prepared['raw_sources'] ?? [];
    $hadFailures = (bool)($prepared['had_failures'] ?? false);
    $cleanup     = $prepared['cleanup'] ?? [];

    if (empty($segments) && empty($rawSources)) {
        throw new \RuntimeException('NO_CLIPS: This project does not contain any video clips to export.');
    }

    if ($hadFailures) {
        Log::error('Export aborted: one or more clip segments failed to render.', [
            'project_id' => $project->id,
            'clip_count' => count($project->clips ?? []),
        ]);

        throw new \RuntimeException('SEGMENT_RENDER_FAILED: One or more clip segments failed to render.');
    }

    $basePath     = null;
    $hasBaseAudio = false;
    // Base video (concatenate/transition if we have segments, else first raw source)
    if (!empty($segments)) {
        $transitionMap = $this->buildTransitionMap($project);
        $combined      = $this->combineSegmentsWithTransitions($segments, $transitionMap, $directory);
        $intermediate  = $combined['path'];
        $cleanup       = array_merge($cleanup, $combined['cleanup'] ?? []);
        $basePath      = $intermediate;
    } else {
        $basePath = $rawSources[0] ?? null;
    }

    if (!$basePath || !file_exists($basePath)) {
        throw new \RuntimeException('BASE_ASSEMBLY_FAILED: Unable to assemble base video for export.');
    }

    $hasBaseAudio = $this->hasAudioStream($basePath);

    // Music + overlays
    $music   = $this->gatherMusicSources($project, $directory);
    $cleanup = array_merge($cleanup, $music['cleanup'] ?? []);

    if (!$this->applyTimelineOverlays(
        $basePath,
        $videoPath,
        is_array($project->effects) ? $project->effects : [],
        is_array($project->text_overlays) ? $project->text_overlays : [],
        $music['tracks'] ?? [],
        $hasBaseAudio
    )) {
        throw new \RuntimeException('OVERLAY_APPLY_FAILED: Unable to apply effects/text/music during export.');
    }

    // cleanup intermediates
    foreach ($cleanup as $tempPath) {
        if (is_string($tempPath) && $tempPath && file_exists($tempPath)) {
            @unlink($tempPath);
        }
    }
    if (isset($intermediate) && $intermediate && file_exists($intermediate) && $intermediate !== $videoPath) {
        @unlink($intermediate);
    }

    if (!file_exists($videoPath)) {
        throw new \RuntimeException('MISSING_OUTPUT: Export finished without producing an output file.');
    }

    return [
        'videoPath' => $videoPath,
        'fileName' => $videoFileName,
        'fileSize' => @filesize($videoPath) ?: null,
    ];
}
}
