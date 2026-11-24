<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Interview extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['scheduled_at' => 'datetime'];
    }

    public function application()
    {
        return $this->belongsTo(JobApplication::class, 'application_id');
    }
}
