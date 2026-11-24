<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Goal extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['target_date' => 'date', 'progress' => 'integer'];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
