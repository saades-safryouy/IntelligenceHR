<?php

namespace App\Support;

final class Permissions
{
    /** Permission sets commonly reused across routes */
    public const DIRECTORY_VIEW = [
        'people.employee.view',
        'people.employee.view.all',
        'people.employee.view.department',
        'people.employee.self.view',
    ];

    public const ORGANIGRAM_VIEW = [
        'organigram.view',
        'people.employee.view.all',
        'people.employee.view.department',
        'people.employee.self.view',
    ];

    public const EMPLOYEE_SELF_OR_HR_UPDATE = [
        'people.employee.update',
        'people.employee.self.update',
    ];

    public const WORKFLOW_INSTANCE_VIEW = [
        'workflow.instance.view',
        'workflow.instance.view.all',
        'workflow.approve',
    ];

    public const WORKFLOW_INSTANCE_LIST = [
        'workflow.instance.view',
        'workflow.instance.view.all',
        'workflow.instance.start',
        'workflow.approve',
    ];

    public const WORKFLOW_DELEGATE_OR_APPROVE = [
        'workflow.delegate',
        'workflow.approve',
    ];

    public const LEAVE_UPDATE = [
        'people.employee.self.update',
        'people.employee.update',
    ];

    public const DOCUMENT_VIEW = [
        'people.document.view',
        'people.document.view.confidential',
        'people.employee.view.all',
        'people.employee.view.department',
        'people.employee.view',
        'people.employee.self.view',
    ];

    public const DOCUMENT_UPLOAD = [
        'people.document.upload',
        'people.employee.update',
    ];

    public const DOCUMENT_REVIEW = [
        'people.document.review',
        'people.employee.update',
    ];

    public const DOCUMENT_ARCHIVE = [
        'people.document.archive',
        'people.employee.update',
    ];

    public const DOCUMENT_DELETE = [
        'people.document.delete',
        'people.employee.update',
    ];

    /**
     * Formats a permission or list of permissions into the middleware string.
     *
     * @param list<string>|string $permissions
     */
    public static function any(array|string $permissions): string
    {
        $list = is_array($permissions) ? $permissions : [$permissions];

        return 'permission:'.implode(',', $list);
    }
}
