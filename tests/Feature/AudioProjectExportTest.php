<?php

namespace Tests\Feature;

use App\Http\Controllers\AudioProjectExportController;
use App\Models\AudioProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Tests\TestCase;

class AudioProjectExportTest extends TestCase
{
    use RefreshDatabase;

    protected function createAudioProject(User $user, array $attributes = []): AudioProject
    {
        $defaults = [
            'user_id' => $user->id,
            'name' => 'Demo Audio Project',
            'description' => null,
            'favorited_project' => false,
            'tracks' => [],
        ];

        return AudioProject::create(array_merge($defaults, $attributes));
    }

    public function test_owner_can_view_audio_export_page(): void
    {
        $user = User::factory()->create();
        $project = $this->createAudioProject($user);

        $this->actingAs($user)
            ->get(route('audio.projects.export', $project))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('AudioExport')
                ->has('project', fn (Assert $projectData) => $projectData
                    ->where('name', 'Demo Audio Project')
                    ->etc()
                )
                ->has('exportWindow', fn (Assert $window) => $window->has('allowed')->etc())
            );
    }

    public function test_audio_export_download_requires_recent_save(): void
    {
        config(['quickcut.export.recent_window_seconds' => 60]);

        $user = User::factory()->create();
        $project = $this->createAudioProject($user);
        $project->forceFill(['updated_at' => now()->subMinutes(10)])->saveQuietly();

        $this->actingAs($user)
            ->get(route('audio.projects.export.download', $project))
            ->assertStatus(409)
            ->assertJsonFragment([
                'message' => 'Please save your project in the editor before exporting.',
            ]);
    }

    public function test_successful_audio_export_returns_audio_file(): void
    {
        config(['quickcut.export.recent_window_seconds' => 60]);

        $user = User::factory()->create();
        $project = $this->createAudioProject($user);

        Storage::fake('public');
        $samplePath = 'audio/' . uniqid('sample_', true) . '.wav';
        Storage::disk('public')->put($samplePath, $this->makeWaveFileContents());

        $project->update([
            'tracks' => [[
                'id' => 'track-1',
                'name' => 'Sample Track.wav',
                'storageKey' => $samplePath,
                'startTime' => 0,
                'startOffset' => 0,
                'duration' => 1.0,
                'sourceDuration' => 1.0,
                'volume' => 1.0,
            ]],
        ]);
        $project->touch();

        app()->instance(AudioProjectExportController::class, new class extends AudioProjectExportController {
            protected function buildAudioMix(array $tracks, float $timelineDuration, string $outputPath): bool
            {
                if (empty($tracks)) {
                    return false;
                }

                $source = $tracks[0]['path'] ?? null;
                if (!is_string($source) || $source === '') {
                    return false;
                }

                return copy($source, $outputPath) !== false;
            }
        });

        $response = $this->actingAs($user)->get(route('audio.projects.export.download', $project));

        $response->assertOk();
        $response->assertHeader('content-type', 'audio/mpeg');

        $baseResponse = $response->baseResponse;
        $this->assertInstanceOf(StreamedResponse::class, $baseResponse);
        $this->assertNotEmpty($response->streamedContent());
    }

    protected function makeWaveFileContents(): string
    {
        $durationSeconds = 1;
        $sampleRate = 44100;
        $channels = 1;
        $bitsPerSample = 16;

        $numSamples = $sampleRate * $durationSeconds;
        $blockAlign = $channels * ($bitsPerSample / 8);
        $byteRate = $sampleRate * $blockAlign;
        $dataSize = $numSamples * $blockAlign;
        $riffChunkSize = 36 + $dataSize;

        $payload = 'RIFF';
        $payload .= pack('V', $riffChunkSize);
        $payload .= 'WAVEfmt ';
        $payload .= pack('V', 16);
        $payload .= pack('v', 1);
        $payload .= pack('v', $channels);
        $payload .= pack('V', $sampleRate);
        $payload .= pack('V', $byteRate);
        $payload .= pack('v', $blockAlign);
        $payload .= pack('v', $bitsPerSample);
        $payload .= 'data';
        $payload .= pack('V', $dataSize);
        $payload .= str_repeat(pack('v', 0), $numSamples);

        return $payload;
    }
}
