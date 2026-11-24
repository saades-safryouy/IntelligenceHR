<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TrainingCourse extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['duration_hours' => 'integer'];
    }

    public function enrollments()
    {
        return $this->hasMany(TrainingEnrollment::class, 'course_id');
    }
}
