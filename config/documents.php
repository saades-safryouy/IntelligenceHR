<?php

return [
    'disk' => env('DOCUMENT_STORAGE_DISK', 'local'),
    'max_upload_kb' => (int) env('DOCUMENT_MAX_UPLOAD_KB', 10240),
    'allowed_extensions' => ['pdf', 'jpg', 'jpeg', 'png', 'docx'],
];
