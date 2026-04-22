<?php

namespace App\Jobs;

use App\Http\Controllers\ProjectExportController;
use App\Models\ExportRender;
use App\Models\Project;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class RenderVideoExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;
    public int $tries = 1;

    public function __construct(
        public readonly int $exportRenderId,
        public readonly int $projectId,
    ) {}

    public function handle(): void
    {
        $render = ExportRender::find($this->exportRenderId);
        if (!$render) {
            return;
        }

        $project = Project::find($this->projectId);
        if (!$project) {
            $render->update([
                'status'        => 'failed',
                'error_message' => 'Project not found.',
                'error_code'    => 'PROJECT_NOT_FOUND',
            ]);
            return;
        }

        $render->update(['status' => 'processing', 'progress_step' => 'Starting export…']);

        $onProgress = function (string $step) use ($render): void {
            Log::info('[Export] ' . $step, ['render_id' => $render->id, 'project_id' => $this->projectId]);
            $render->update(['progress_step' => $step]);
        };

        try {
            $result = app(ProjectExportController::class)->executeExport($project, $onProgress);

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
            Log::error('RenderVideoExport job exception', [
                'render_id'  => $this->exportRenderId,
                'project_id' => $this->projectId,
                'error'      => $e->getMessage(),
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
        ExportRender::where('id', $this->exportRenderId)->update([
            'status'        => 'failed',
            'progress_step' => 'Job failed: ' . $exception->getMessage(),
            'error_message' => $exception->getMessage(),
            'error_code'    => 'JOB_FAILED',
        ]);
    }
}
