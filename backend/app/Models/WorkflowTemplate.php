<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkflowTemplate extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function versions()
    {
        return $this->hasMany(WorkflowTemplateVersion::class)->orderBy('version_number');
    }

    public function publishedVersion()
    {
        return $this->hasOne(WorkflowTemplateVersion::class)->where('status', 'published')->latest('version_number');
    }
}
