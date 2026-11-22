<?php

namespace App\Console\Commands;

use App\Models\EmployeeDocument;
use App\Models\EmployeeNotification;
use Illuminate\Console\Command;

class NotifyExpiringEmployeeDocuments extends Command
{
    protected $signature = 'documents:notify-expiring';

    protected $description = 'Notify employees when approved documents expire within 30 days';

    public function handle(): int
    {
        EmployeeDocument::query()
            ->with('employee.user')
            ->where('status', 'approved')
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '>=', today())
            ->whereDate('expiry_date', '<=', today()->addDays(30))
            ->chunkById(100, function ($documents): void {
                foreach ($documents as $document) {
                    $user = $document->employee?->user;
                    if (! $user) {
                        continue;
                    }

                    EmployeeNotification::firstOrCreate(
                        ['deduplication_key' => 'document-expiry:'.$document->id.':'.$document->expiry_date->toDateString()],
                        [
                            'recipient_user_id' => $user->id,
                            'type' => 'document.expiring',
                            'title' => 'Document expiring soon',
                            'body' => $document->name.' expires on '.$document->expiry_date->toDateString().'.',
                            'resource_type' => 'employee_document',
                            'resource_id' => (string) $document->id,
                        ],
                    );
                }
            });

        $this->info('Expiry notifications processed.');

        return self::SUCCESS;
    }
}
