<?php

return [
    'export' => [
        'recent_window_seconds' => (int) env('QUICKCUT_EXPORT_RECENT_WINDOW', 300),
        'default_font_path' => env('QUICKCUT_EXPORT_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        'ffmpeg_path' => env('FFMPEG_PATH', env('QUICKCUT_FFMPEG_PATH', 'ffmpeg')),
        'ffprobe_path' => env('FFPROBE_PATH', env('QUICKCUT_FFPROBE_PATH', 'ffprobe')),
    ],
];
