# Intelligence RH API

Laravel 12 REST backend for the existing React + TypeScript application in this repository. API routes are versioned under `/api/v1`.

## Requirements

- PHP 8.2+
- Composer 2
- PostgreSQL 15+
- Node.js 20+ for the separate frontend

## Local setup

1. Copy `.env.example` to `.env`, set a unique `APP_KEY`, and configure `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`. Do not commit `.env` or production secrets.
2. Install PHP dependencies with `composer install`.
3. Run `php artisan key:generate` for a local install.
4. Apply schema changes with `php artisan migrate`.
5. Seed the proposed role and permission catalogs with `php artisan db:seed`.
6. Provision the first RBAC administrator interactively with `php artisan app:provision-rbac-admin`. This prompts for an email and a 14-character-minimum password; it does not grant People, sensitive-field, or approval permissions.
7. Start the API with `php artisan serve`.

The provision command creates only the one-time technical RBAC bootstrap role. An operator must explicitly create/assign business roles and any permitted access. Example role names and module policies remain proposed until approved.

### Windows PostgreSQL setup

Install PostgreSQL for Windows and start its PostgreSQL service. In pgAdmin, create a login role named `intelligence_rh_app` without superuser, database-creation, or role-creation privileges; set its password in pgAdmin and in the ignored `.env` file only. Create `intelligence_rh` owned by that role. Connect pgAdmin's Query Tool to `intelligence_rh` as its owner/admin and grant the app role schema access:

```sql
GRANT USAGE, CREATE ON SCHEMA public TO intelligence_rh_app;
```

Enable `pdo_pgsql` and `pgsql` in the PHP CLI's active `php.ini`, then verify with `php -m`. From the backend directory run `php artisan config:clear`, `php artisan migrate:status`, `php artisan migrate`, and `php artisan db:seed`. Never use `migrate:fresh` on a database containing data.

### Local demo data

Demo data is separate from the normal RBAC catalog seeder. Set `DEMO_USER_PASSWORD` in the ignored local `.env` to a unique password with at least 14 characters; it is used only for newly created demo accounts, and existing account passwords are never changed. Then run:

```powershell
php artisan db:seed
php artisan db:seed --class=DemoDataSeeder
```

The deterministic seeder adds 100 employees (84 Active, 8 On Leave, 3 Suspended, 5 Terminated), 8 departments, 8 teams, 20 positions, 99 dated manager relationships, 20 employee-linked demo users plus one standalone HR admin, 2 generic E-Flow templates and 15 approval instances (8 pending, 5 approved, 1 rejected, 1 returned for correction), and 35 in-app notifications. It preserves the 6 proposed roles and 42 permissions and adds local demo-only role grants without granting sensitive-field permissions. Demo roles are HR Admin, CEO/Workflow Approver, Department Manager + Workflow Approver, and Employee; managers receive only their demo department scope. The same configured password is used only when an account is first created. Demo login emails are `demo.hr.admin@intelligence-rh.example.test`, `demo.ceo@intelligence-rh.example.test`, `demo.manager.01@intelligence-rh.example.test` through `demo.manager.07@intelligence-rh.example.test`, and `demo.employee.01@intelligence-rh.example.test` through `demo.employee.12@intelligence-rh.example.test`.

Reset demo fixtures only with `php artisan demo:reset` and confirm the prompt, or use `php artisan demo:reset --force` in local/testing. The reset deletes only demo-prefixed accounts, fixtures, notifications, and E-Flow data. It preserves role/permission catalogs and role grants, audit history, and all other records. The command refuses to run outside local/testing.

Leave requests and balances, holidays, onboarding cases/tasks, offboarding cases, employee documents, and their APIs are present. `/api/v1/employees/summary` returns data scoped to the authenticated employee for the employee portal; other employee-specific endpoints enforce the same visibility rules. Document files use the private Laravel storage disk; configure `DOCUMENT_STORAGE_DISK` to a non-public private disk and `DOCUMENT_MAX_UPLOAD_KB` for the upload limit. The scheduled `documents:notify-expiring` command creates one recipient-scoped notification per document expiry date for approved documents due within 30 days. Offboarding has no task table. The summary endpoint is employee-specific, not a general dashboard-statistics API. Unsupported information should not be filled with frontend demo data in API mode.

The People list endpoint remains server-paginated and accepts allowlisted independent filters in `filters[field]` parameters; date ranges use `filters[field][from]`/`[to]`, and numeric comparisons use `filters[field][operator]`/`[value]`. Multiple filters are combined with AND inside the authenticated employee visibility scope. Sensitive-field filters and sorts require the matching field permission. The employee schema does not contain profile photos, birth dates, addresses, personal email addresses, employee numbers, or contract start/end dates; the UI uses initials for avatars and does not fabricate those fields.

## First-party SPA authentication

Sanctum uses stateful HTTP-only session cookies and CSRF protection. Set `FRONTEND_ORIGINS` and `SANCTUM_STATEFUL_DOMAINS` to the exact local or deployed frontend origin/host. Keep `SESSION_SECURE_COOKIE=true` and HTTPS in production. The frontend obtains `/sanctum/csrf-cookie` before login and sends credentials with same-site requests.

Authentication endpoints:

- `POST /api/v1/auth/login` — `{ "email": "...", "password": "..." }`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Private endpoints require a valid session and backend permission. Frontend route visibility is a UX aid only; it is not an authorization boundary.

## Tests

`php artisan test` uses the configured test database (the checked-in `phpunit.xml` uses in-memory SQLite). After the local PostgreSQL demo seed is present, run `vendor/bin/phpunit -c phpunit.pgsql.xml` for read-only PostgreSQL fixture/API integration checks. Repeat this check against any target deployment database before release.

## Current implementation scope

Implemented foundations: session authentication, People CRUD and catalog APIs, employee reporting/organigram APIs, employee self-service profile/leave/onboarding/offboarding APIs, secure employee document upload/review/download/archive APIs, holidays, RBAC catalogs and assignment APIs, recipient-scoped notification APIs, workflow templates/instances/decisions/history, audit records, migrations, seed catalog, and feature tests.

Still pending: production deployment configuration, offboarding task management, business-approved workflow policies, broader aggregate dashboard statistics, integration of remaining frontend repositories, and controlled localStorage migration. Document association with onboarding tasks is not represented by the existing data model. No existing localStorage records are imported or overwritten.

Document endpoints under `/api/v1/employee-documents` support HR-created document requests, private uploads/replacements, preview/download, review, archive, and permission-gated permanent deletion. Employees can upload only to their own HR-requested records and can view only documents within their employee visibility scope. When exactly one active published workflow template exists for the `documents` module and `document` resource type, file submission starts that existing workflow engine; its final decisions update document review status and notify the employee. Without a configured template, the existing permission-gated HR review action remains available. Workflow notifications link to the approval details screen. Supported uploads are PDF, JPEG, PNG, and DOCX; internal storage paths are never returned by the API.
