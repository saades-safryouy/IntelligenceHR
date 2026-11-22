<?php

use App\Http\Controllers\Api\V1\WorkflowController;
use App\Support\Permissions;
use Illuminate\Support\Facades\Route;

Route::get('/workflow-templates', [WorkflowController::class, 'templates'])
    ->middleware(Permissions::any('workflow.template.view'));

Route::post('/workflow-templates', [WorkflowController::class, 'createTemplate'])
    ->middleware(Permissions::any('workflow.template.create'));

Route::post('/workflow-templates/{workflowTemplate}/versions', [WorkflowController::class, 'createVersion'])
    ->middleware(Permissions::any('workflow.template.update'));

Route::post('/workflow-template-versions/{workflowTemplateVersion}/publish', [WorkflowController::class, 'publishVersion'])
    ->middleware(Permissions::any('workflow.template.publish'));

Route::get('/workflow-instances', [WorkflowController::class, 'index'])
    ->middleware(Permissions::any(Permissions::WORKFLOW_INSTANCE_LIST));

Route::post('/workflow-instances', [WorkflowController::class, 'start'])
    ->middleware(Permissions::any('workflow.instance.start'));

Route::get('/workflow-instances/{workflowInstance}', [WorkflowController::class, 'show'])
    ->middleware(Permissions::any(Permissions::WORKFLOW_INSTANCE_VIEW));

Route::get('/workflow-instances/{workflowInstance}/resource', [WorkflowController::class, 'resource'])
    ->middleware(Permissions::any(Permissions::WORKFLOW_INSTANCE_VIEW));

Route::post('/workflow-instances/{workflowInstance}/actions', [WorkflowController::class, 'decide'])
    ->middleware(Permissions::any('workflow.approve'));

Route::get('/workflow-instances/{workflowInstance}/history', [WorkflowController::class, 'history'])
    ->middleware(Permissions::any('workflow.history.view'));

Route::get('/workflow-delegations', [WorkflowController::class, 'delegations'])
    ->middleware(Permissions::any(Permissions::WORKFLOW_DELEGATE_OR_APPROVE));

Route::post('/workflow-delegations', [WorkflowController::class, 'createDelegation'])
    ->middleware(Permissions::any('workflow.delegate'));

Route::delete('/workflow-delegations/{delegation}', [WorkflowController::class, 'revokeDelegation'])
    ->middleware(Permissions::any('workflow.delegate'));
