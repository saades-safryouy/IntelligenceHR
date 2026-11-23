<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReportingRelationship extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['effective_from' => 'date', 'effective_to' => 'date', 'is_primary' => 'boolean'];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function manager()
    {
        return $this->belongsTo(Employee::class, 'manager_employee_id');
    }
}
