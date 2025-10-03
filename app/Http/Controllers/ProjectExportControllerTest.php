<?php

namespace Tests\Unit;

use App\Http\Controllers\ProjectExportController;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

class ProjectExportControllerTest extends TestCase
{
    #[DataProvider('escapeProvider')]
    public function testEscapeFilterValue(string $input, string $expected): void
    {
        $controller = new ProjectExportController();
        $reflection = new ReflectionClass($controller);
        $method = $reflection->getMethod('escapeFilterValue');
        $method->setAccessible(true);

        $this->assertSame($expected, $method->invoke($controller, $input));
    }

    public static function escapeProvider(): array
    {
        return [
            'basic percent' => ['100% ready', '100\\% ready'],
            'newline handling' => ["Line 1\nLine 2", 'Line 1\\nLine 2'],
            'carriage return normalised' => ["First\r\nSecond", 'First\\nSecond'],
            'multiple characters' => ["[test]: value;%", "\\[test\\]\\: value\\;\\%"],
        ];
    }
}