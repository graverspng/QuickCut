<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ProjectExportTest extends TestCase
{
    use RefreshDatabase;

    protected function createProject(User $user, array $attributes = []): Project
    {
        $defaults = [
            'user_id' => $user->id,
            'name' => 'Demo Project',
            'description' => null,
            'favorited_project' => false,
            'media_files' => [],
            'clips' => [],
            'music_tracks' => [],
            'effects' => [],
            'text_overlays' => [],
            'transitions' => [],
        ];

        return Project::create(array_merge($defaults, $attributes));
    }

    public function test_owner_can_view_export_page(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);

        $this->actingAs($user)
            ->get(route('projects.export', $project))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Export')
                ->has('project', fn (Assert $projectData) => $projectData
                    ->where('name', 'Demo Project')
                    ->etc()
                )
                ->has('exportWindow', fn (Assert $window) => $window->has('allowed')->etc())
            );
    }

    public function test_export_download_requires_recent_save(): void
    {
        config(['quickcut.export.recent_window_seconds' => 60]);

        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->updated_at = now()->subMinutes(10);
        $project->save();

        $this->actingAs($user)
            ->get(route('projects.export.download', $project))
            ->assertStatus(409)
            ->assertJsonFragment([
                'message' => 'Please save your project in the editor before exporting.',
            ]);
    }

    public function test_successful_export_returns_zip_package(): void
    {
        config(['quickcut.export.recent_window_seconds' => 60]);

        $user = User::factory()->create();
        $project = $this->createProject($user);

        Storage::fake('public');
        $mediaPath = "projects/{$project->id}/media/sample.mp4";
        Storage::disk('public')->put($mediaPath, 'video');
        $project->update([
            'media_files' => [[
                'id' => 'clip-1',
                'name' => 'Sample Clip.mp4',
                'path' => $mediaPath,
                'mime' => 'video/mp4',
                'size' => 128,
                'kind' => 'video',
            ]],
        ]);
        $project->touch();

        $response = $this->actingAs($user)->get(route('projects.export.download', $project));

        $response->assertOk();
        $response->assertHeader('content-type', 'application/zip');

        $binary = $response->baseResponse;
        $this->assertInstanceOf(\Symfony\Component\HttpFoundation\BinaryFileResponse::class, $binary);
        $tempPath = $binary->getFile()->getPathname();
        $this->assertFileExists($tempPath);

        $zip = new \ZipArchive();
        $this->assertTrue($zip->open($tempPath));
        $this->assertNotFalse($zip->locateName('project.json'));
        $this->assertNotFalse($zip->locateName('manifest.json'));
        $manifestData = json_decode($zip->getFromName('manifest.json'), true);
        $zip->close();
        @unlink($tempPath);

        $this->assertIsArray($manifestData);
        $this->assertEquals('Demo Project', $manifestData['project']['name']);
        $this->assertCount(1, $manifestData['media']);
    }
}