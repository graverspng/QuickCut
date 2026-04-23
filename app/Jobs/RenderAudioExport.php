<?php

namespace App\Jobs;

use App\Http\Controllers\AudioProjectExportController;
use App\Models\AudioExportRender;
use App\Models\AudioProject;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class RenderAudioExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;
    public int $tries = 1;

    public function __construct(
        public readonly int $renderId,
        public readonly int $audioProjectId,
    ) {}

    public function handle(): void
    {
        $render = AudioExportRender::find($this->renderId);
        if (!$render) {
            return;
        }

        $project = AudioProject::find($this->audioProjectId);
        if (!$project) {
            $render->update([
                'status'        => 'failed',
                'error_message' => 'Audio project not found.',
                'error_code'    => 'PROJECT_NOT_FOUND',
            ]);
            return;
        }

        $render->update(['status' => 'processing', 'progress_step' => 'Starting audio export…']);

        $onProgress = function (string $step) use ($render): void {
            $render->update(['progress_step' => $step]);
        };

        try {
            $result = app(AudioProjectExportController::class)->executeAudioExport($project, $onProgress);

            if ($result['ok']) {
                $render->update([
                    'status'        => 'done',
                    'progress_step' => 'Done',
                    'output_path'   => $result['path'],
                ]);
            } else {
                $render->update([
                    'status'        => 'failed',
                    'progress_step' => 'Failed',
                    'error_message' => $result['message'],
                    'error_code'    => $result['code'] ?? 'EXPORT_FAILED',
                ]);
            }
        } catch (\Throwable $e) {
            Log::error('RenderAudioExport job exception', [
                'render_id'        => $this->renderId,
                'audio_project_id' => $this->audioProjectId,
                'error'            => $e->getMessage(),
            ]);
            $render->update([
                'status'        => 'failed',
                'progress_step' => 'Exception: ' . $e->getMessage(),
                'error_message' => $e->getMessage(),
                'error_code'    => 'JOB_EXCEPTION',
            ]);
        }
    }

    public function failed(\Throwable $exception): void
    {
        AudioExportRender::where('id', $this->renderId)->update([
            'status'        => 'failed',
            'progress_step' => 'Job failed: ' . $exception->getMessage(),
            'error_message' => $exception->getMessage(),
            'error_code'    => 'JOB_FAILED',
        ]);
    }
}
