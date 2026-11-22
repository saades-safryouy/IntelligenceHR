<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OffboardingCase extends Model
{
    use HasUuids;

    protected $fillable = ['employee_id', 'employee_name', 'exit_date', 'reason', 'replacement', 'stage', 'progress', 'status', 'approval_status'];

    protected function casts(): array
    {
        return [
            'exit_date' => 'date',
            'progress' => 'integer',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
