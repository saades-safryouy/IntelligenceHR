<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReviewCycle extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['period_start' => 'date', 'period_end' => 'date'];
    }

    public function reviews()
    {
        return $this->hasMany(PerformanceReview::class, 'cycle_id');
    }
}
