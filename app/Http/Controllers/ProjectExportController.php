<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use ZipArchive;

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
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $fileSafeName = Str::slug($project->name ?: 'quickcut-project');
        $timestamp = now()->format('Ymd_His');
        $zipFileName = $fileSafeName ? $fileSafeName . "-{$timestamp}-{$exportId}.zip" : "quickcut-project-{$timestamp}-{$exportId}.zip";
        $zipPath = $directory . DIRECTORY_SEPARATOR . $zipFileName;

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            abort(500, 'Unable to create export package.');
        }

        $mediaManifest = [];
        foreach (($project->media_files ?? []) as $index => $media) {
            if (!is_array($media)) {
                continue;
            }
            $entry = [
                'index' => $index,
                'id' => $media['id'] ?? null,
                'name' => $media['name'] ?? null,
                'mime' => $media['mime'] ?? null,
                'size' => $media['size'] ?? null,
                'path' => $media['path'] ?? null,
                'kind' => $media['kind'] ?? null,
                'exported' => false,
            ];

            $storagePath = $media['path'] ?? null;
            if ($storagePath && Storage::disk('public')->exists($storagePath)) {
                $absolutePath = Storage::disk('public')->path($storagePath);
                if (is_file($absolutePath)) {
                    $baseName = basename($storagePath);
                    if (!empty($media['id'])) {
                        $baseName = $media['id'] . '-' . $baseName;
                    }
                    $targetName = 'media/' . $baseName;
                    $zip->addFile($absolutePath, $targetName);
                    $entry['export_name'] = $targetName;
                }
                $entry['exported'] = true;
            }

            $entry['missing'] = !$entry['exported'];
            $mediaManifest[] = $entry;
        }

        $exportedAt = now();
        $projectData = [
            'id' => $project->id,
            'name' => $project->name,
            'description' => $project->description,
            'exported_at' => $exportedAt->toIso8601String(),
            'updated_at' => optional($project->updated_at)->toIso8601String(),
            'clips' => $project->clips ?? [],
            'media_files' => $project->media_files ?? [],
            'music_tracks' => $project->music_tracks ?? [],
            'effects' => $project->effects ?? [],
            'text_overlays' => $project->text_overlays ?? [],
            'transitions' => $project->transitions ?? [],
        ];

        $manifest = [
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'summary' => [
                    'media' => count($project->media_files ?? []),
                    'clips' => count($project->clips ?? []),
                    'music' => count($project->music_tracks ?? []),
                    'effects' => count($project->effects ?? []),
                    'text' => count($project->text_overlays ?? []),
                    'transitions' => count($project->transitions ?? []),
                ],
            ],
            'generated_at' => $exportedAt->toIso8601String(),
            'media' => $mediaManifest,
        ];

        $generatedDisplay = $exportedAt->toDayDateTimeString();
        $projectNameForReadme = $project->name ?? 'Untitled Project';

        $readme = <<<TXT
QuickCut Export Package
=======================

Generated: {$generatedDisplay}
Project: {$projectNameForReadme}

Contents:
- project.json : Full project timeline data.
- manifest.json: Summary of assets and export metadata.
- media/       : Media files that were available locally during export.

Re-import instructions:
1. Extract this archive.
2. Use project.json for ingesting timeline details into your preferred tooling.
3. Media files that could not be copied are marked in manifest.json.

TXT;

        $zip->addFromString('project.json', json_encode($projectData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $zip->addFromString('README.txt', $readme);
        $zip->close();

        $downloadName = $fileSafeName ? $fileSafeName . '-quickcut-export.zip' : 'quickcut-export.zip';

        return response()->download($zipPath, $downloadName, [
            'Content-Type' => 'application/zip',
        ])->deleteFileAfterSend(true);
    }
}