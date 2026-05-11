<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Symfony\Component\Process\Process;

class FormatChangerController extends Controller
{
    public function index()
    {
        return Inertia::render('FormatChanger');
    }

    public function convert(Request $request)
    {
        $request->validate([
            'file'   => ['required', 'file', 'max:512000'], // 500 MB in KB
            'target' => ['required', 'in:mp3,mp4,png'],
        ]);

        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        @ini_set('max_execution_time', '0');

        $target       = $request->input('target');
        $file         = $request->file('file');
        $originalName = $file->getClientOriginalName();
        $tmpDir       = storage_path('app/tmp');

        if (!is_dir($tmpDir)) {
            mkdir($tmpDir, 0755, true);
        }

        $inputExt  = strtolower($file->getClientOriginalExtension()) ?: 'tmp';
        $inputName = uniqid('fc_in_') . '.' . $inputExt;
        $outName   = uniqid('fc_out_') . '.' . $target;
        $inputPath  = $tmpDir . DIRECTORY_SEPARATOR . $inputName;
        $outputPath = $tmpDir . DIRECTORY_SEPARATOR . $outName;

        $file->move($tmpDir, $inputName);

        $ffmpeg = $this->resolveFfmpeg();

        if ($target === 'mp3') {
            $args = [
                $ffmpeg, '-y', '-nostats', '-loglevel', 'error',
                '-i', $inputPath,
                '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                $outputPath,
            ];
        } elseif ($target === 'png') {
            $args = [
                $ffmpeg, '-y', '-nostats', '-loglevel', 'error',
                '-i', $inputPath,
                '-vframes', '1',
                $outputPath,
            ];
        } else {
            $args = [
                $ffmpeg, '-y', '-nostats', '-loglevel', 'error',
                '-i', $inputPath,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac', '-b:a', '192k',
                '-movflags', '+faststart',
                $outputPath,
            ];
        }

        $process = new Process($args);
        $process->setTimeout(null);
        $process->setIdleTimeout(null);

        $ffmpegErr = '';
        $process->run(function (string $type, string $buf) use (&$ffmpegErr): void {
            if ($type === Process::ERR) {
                $ffmpegErr .= $buf;
                if (strlen($ffmpegErr) > 32768) {
                    $ffmpegErr = substr($ffmpegErr, -32768);
                }
            }
        });

        @unlink($inputPath);

        if (!$process->isSuccessful() || !file_exists($outputPath) || filesize($outputPath) === 0) {
            if (file_exists($outputPath)) {
                @unlink($outputPath);
            }
            return response()->json([
                'message' => 'Conversion failed. The file may be in an unsupported format or codec.',
            ], 422);
        }

        $base         = pathinfo($originalName, PATHINFO_FILENAME);
        $downloadName = (Str::slug($base) ?: 'converted') . '.' . $target;
        $mimeType     = match ($target) {
            'mp3'   => 'audio/mpeg',
            'png'   => 'image/png',
            default => 'video/mp4',
        };
        $fileSize     = filesize($outputPath);

        return response()->streamDownload(function () use ($outputPath) {
            $handle = @fopen($outputPath, 'rb');
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
                @unlink($outputPath);
            }
        }, $downloadName, [
            'Content-Type'        => $mimeType,
            'Content-Length'      => (string) $fileSize,
            'X-Accel-Buffering'   => 'no',
        ]);
    }

    private function resolveFfmpeg(): string
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $candidates = array_filter([
            (string) config('quickcut.export.ffmpeg_path', ''),
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/bin/ffmpeg',
            '/opt/homebrew/bin/ffmpeg',
            'C:/ffmpeg/bin/ffmpeg.exe',
        ]);

        foreach ($candidates as $candidate) {
            if (str_contains($candidate, '/') || str_contains($candidate, '\\')) {
                if (@is_file($candidate) && @is_executable($candidate)) {
                    return $cache = $candidate;
                }
            } else {
                try {
                    $which = new Process(['which', $candidate]);
                    $which->setTimeout(1);
                    $which->run();
                    if ($which->isSuccessful() && ($p = trim($which->getOutput())) !== '') {
                        return $cache = $p;
                    }
                } catch (\Throwable) {
                    // continue to next candidate
                }
            }
        }

        return $cache = 'ffmpeg';
    }
}
