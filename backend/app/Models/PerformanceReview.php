<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PerformanceReview extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['rating' => 'integer'];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(Employee::class, 'reviewer_id');
    }

    public function cycle()
    {
        return $this->belongsTo(ReviewCycle::class, 'cycle_id');
    }
}
