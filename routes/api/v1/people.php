<?php

use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\OrganigramController;
use App\Http\Controllers\Api\V1\PeopleController;
use App\Support\Permissions;
use Illuminate\Support\Facades\Route;

Route::get('/employees/summary', [PeopleController::class, 'summary'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::get('/employees', [PeopleController::class, 'index'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::post('/employees', [PeopleController::class, 'store'])
    ->middleware(Permissions::any('people.employee.create'));

Route::get('/employees/{employee}', [PeopleController::class, 'show'])
    ->middleware(Permissions::any(Permissions::DIRECTORY_VIEW));

Route::patch('/employees/{employee}', [PeopleController::class, 'update'])
    ->middleware(Permissions::any(Permissions::EMPLOYEE_SELF_OR_HR_UPDATE));

Route::delete('/employees/{employee}', [PeopleController::class, 'destroy'])
    ->middleware(Permissions::any('people.employee.delete'));

Route::put('/employees/{employee}/reporting-relationships', [OrganigramController::class, 'updateReporting'])
    ->middleware(Permissions::any('people.reporting.update'));

Route::get('/org-chart', [OrganigramController::class, 'index'])
    ->middleware(Permissions::any(Permissions::ORGANIGRAM_VIEW));

foreach (['departments', 'teams', 'positions'] as $catalog) {
    Route::get('/'.$catalog, [CatalogController::class, 'index'])
        ->defaults('catalog', $catalog)
        ->middleware(Permissions::any('people.catalog.view'));

    Route::post('/'.$catalog, [CatalogController::class, 'store'])
        ->defaults('catalog', $catalog)
        ->middleware(Permissions::any('people.catalog.manage'));

    Route::get('/'.$catalog.'/{id}', [CatalogController::class, 'show'])
        ->defaults('catalog', $catalog)
        ->middleware(Permissions::any('people.catalog.view'));

    Route::patch('/'.$catalog.'/{id}', [CatalogController::class, 'update'])
        ->defaults('catalog', $catalog)
        ->middleware(Permissions::any('people.catalog.manage'));

    Route::delete('/'.$catalog.'/{id}', [CatalogController::class, 'destroy'])
        ->defaults('catalog', $catalog)
        ->middleware(Permissions::any('people.catalog.manage'));
}
