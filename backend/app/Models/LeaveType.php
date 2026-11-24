<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    use HasFactory;

    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    public $timestamps = false;

    protected function casts(): array
    {
        return ['paid' => 'boolean', 'default_entitlement_days' => 'integer', 'carry_over_days' => 'integer', 'requires_approval' => 'boolean'];
    }
}
