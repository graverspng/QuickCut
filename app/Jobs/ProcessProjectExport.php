<?php

namespace App\Jobs;

use App\Models\Export;
use App\Models\Project;
use App\Http\Controllers\ProjectExportController;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ProcessProjectExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    protected int $exportId;

    /**
     * Create a new job instance.
     *
     * @return void
     */
    public function __construct(int $exportId)
    {
        $this->exportId = $exportId;
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle()
    {
        $export = Export::find($this->exportId);
        if (!$export) {
            Log::warning('Export job: export record not found', ['export_id' => $this->exportId]);
            return;
        }

        $export->status = 'processing';
        $export->save();

        try {
            $project = Project::findOrFail($export->project_id);

            // Build expected file name and ensure export file is created in same location the controller expects
            $videoFileName = $export->file_name ?: ($export->uuid . '.mp4');

            // Use the controller's existing export pipeline by calling the new public builder method
            $controller = new ProjectExportController();
            $result = $controller->buildExportForJob($project, $export->uuid, $videoFileName);

            if (isset($result['videoPath']) && file_exists($result['videoPath'])) {
                $export->file_path = $result['videoPath'];
                $export->file_name = $result['fileName'] ?? $videoFileName;
                $export->file_size = @filesize($result['videoPath']) ?: null;
                $export->status = 'completed';
                $export->finished_at = now();
                $export->save();
            } else {
                $export->status = 'failed';
                $export->error_message = 'Export produced no file';
                $export->finished_at = now();
                $export->save();
            }
        } catch (\Throwable $e) {
            Log::error('Export job failed', ['export_id' => $this->exportId, 'error' => $e->getMessage()]);
            $export->status = 'failed';
            $export->error_message = $e->getMessage() . "\n" . $e->getTraceAsString();
            $export->finished_at = now();
            $export->save();
        }
    }
}
