<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'name_key', 'date', 'days', 'recurring', 'type', 'country', 'site'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'days' => 'integer',
            'recurring' => 'boolean',
        ];
    }
}
