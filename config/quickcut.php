<?php

return [
    'export' => [
        'recent_window_seconds' => (int) env('QUICKCUT_EXPORT_RECENT_WINDOW', 300),
        'default_font_path' => env('QUICKCUT_EXPORT_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        'ffmpeg_path' => env('FFMPEG_PATH', env('QUICKCUT_FFMPEG_PATH', 'ffmpeg')),
        'ffprobe_path' => env('FFPROBE_PATH', env('QUICKCUT_FFPROBE_PATH', 'ffprobe')),
        'process_timeout' => (int) env('QUICKCUT_EXPORT_PROCESS_TIMEOUT', 1800),
        'allowed_asset_hosts' => array_values(array_filter(array_map('trim', explode(',', (string) env('QUICKCUT_EXPORT_ALLOWED_HOSTS', ''))))),
        'remote_download_max_bytes' => (int) env('QUICKCUT_EXPORT_REMOTE_MAX_BYTES', 50000000),
        'remote_download_timeout' => (int) env('QUICKCUT_EXPORT_REMOTE_TIMEOUT', 20),
    ],
];
