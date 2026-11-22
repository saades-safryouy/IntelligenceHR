# IntelligenceHR — Laravel Backend

Laravel 11 API (PHP 8.2, Sanctum cookie auth, MySQL) for the IntelligenceHR
React frontend (`saades-safryouy/IntelligenceHR`, branch `Frontend`).

The frontend contract lives in `../API_CONTRACT.md` (verified 22 Nov 2026
from the frontend code). This backend implements it exactly — see
"Ambiguity decisions" below for the five choices the contract left open.

## Auth — Sanctum cookie sessions, NOT Bearer tokens

The frontend calls `GET {base}/sanctum/csrf-cookie` (credentials:include),
reads the `XSRF-TOKEN` cookie and sends it as `X-XSRF-TOKEN` on every
non-GET request. No `Authorization` header is ever sent.

## Run locally

```bash
cp .env.example .env
# set DB_* to a local MySQL (or TiDB) database named `intelligencehr`
composer install
php artisan key:generate
php artisan migrate --force
php artisan db:seed
php artisan serve --host=0.0.0.0 --port=8000
```

Seeded accounts (password `TestPassword2026!` for all demo accounts):

| Email | Roles |
|---|---|
| `demo.hr.admin@intelligence-rh.example.test` | hr-admin |
| `demo.manager.01@intelligence-rh.example.test` | manager |
| `demo.employee.01@intelligence-rh.example.test` | employee |
| `saad.hr@intillj.com` (Saad ES-SAFRYOUY, employee 1048) | hr-admin |
| `nadia.rahmani@intillj.com`, `karim.haddad@intillj.com`, `maya.elamrani@intillj.com`, `omar.bennani@intillj.com`, `ahmed.benali@intillj.com` | department-manager / employee |

The seeder also creates 5 departments (eng, ops, sales, finance, people),
3 leave types (annual/sick/unpaid) with entitlements (25/12/30 days),
5 holidays, workflow templates (leave / onboarding / offboarding, v1
published), one example leave request and one onboarding case.

A super-admin is created only when `ADMIN_EMAIL` and `ADMIN_PASSWORD`
are set before seeding.

## Environment variables (deploy)

| Var | Purpose |
|---|---|
| `APP_KEY` | Generate with `php artisan key:generate --show`; set as env var |
| `APP_URL` | Public https URL of this backend (Railway domain) |
| `APP_ENV`, `APP_DEBUG` | `production`, `false` |
| `DB_CONNECTION` | `mysql` |
| `DB_HOST` / `DB_PORT` | TiDB host / `4000` |
| `DB_DATABASE` | `intelligencehr` (new database on the existing TiDB cluster) |
| `DB_USERNAME` / `DB_PASSWORD` | TiDB credentials |
| `MYSQL_ATTR_SSL_CA` | `/etc/ssl/certs/ca-certificates.crt` (TiDB requires TLS) |
| `SESSION_DOMAIN` | Apex domain shared with the frontend, or empty for same-host |
| `SANCTUM_STATEFUL_DOMAINS` | Frontend origin host(s), comma-separated, e.g. `hr-frontend.up.railway.app,localhost:5173` |
| `FRONTEND_URL` | Frontend origin URL (CORS), e.g. `https://hr-frontend.up.railway.app` |
| `SESSION_SECURE_COOKIE` | `true` in production |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Super-admin created at seed time (optional) |

## Deploy (Railway, same project as car_rental)

- New service, Root Directory `backend/`, Dockerfile builder, port 80.
- Add a persistent volume mounted at `/var/www/html/storage/app/public`
  (document uploads; the container entrypoint `docker/start.sh` fixes
  ownership to `www-data` so uploads survive redeploys).
- `docker/start.sh` runs `php artisan migrate --force` on every start.
- Set `APP_URL` to the public https URL so generated URLs are https.

## API

All routes under `/api/v1` (see `routes/api.php`). Response envelopes are
mixed, exactly as the frontend expects:

- Single-resource GET/POST/PATCH → `{ "data": ... }`
- `GET /employees`, `/workflow-instances`, `/workflow-templates`,
  `/workflow-delegations`, `/notifications`, `/workflow-instances/{id}/history`
  → bare page `{ data, page, pageSize, total }`
- `GET /leave-requests` → bare paginated page (see decision #1)
- `GET /org-chart` → `{ data, meta: { cycleDetected } }`
- `GET /employees/summary`, `/dashboard/statistics`, `/analytics/overview`
  → bare objects
- Validation errors → Laravel style `{ "message": "...", "errors": { "field": ["…"] } }`

Leave/onboarding/offboarding decisions happen ONLY via
`POST /workflow-instances/{id}/actions` (`approve` / `reject` / `return`);
there is no `PATCH /leave-requests/{id}`. Submitting a request creates a
workflow instance from the published template version for that resource
type, and a final decision updates the resource status.

## Ambiguity decisions (contract §9)

1. **`/leave-requests` list envelope** — returns a BARE paginated page
   `{data, page, pageSize, total, meta:{current_page, per_page, total,
   last_page, from, to}}`. The `meta` block mirrors Laravel's paginator
   fields; the top-level `page`/`pageSize`/`total` keys are kept so the
   manager dashboard's bare-page reader works unchanged. The HR page
   adapter (which reads an enveloped array via `apiData`) must be fixed
   to read this page shape.
2. **Only routes the frontend actually calls are built.** ARCHITECTURE-only
   routes (`POST /auth/session`, `/teams`, `/positions`, `/roles`,
   `/audit-logs`, `POST /workflow-instances`, …) are intentionally skipped.
3. **Department API shape** — `{id, name, code, description, manager,
   manager_id, employee_count, budget, parent_id, is_active}` where
   `manager` is the manager's full name. The frontend adapter maps
   `head`/`color`/`isActive` later if needed.
4. **Dashboard statistics** — returns the mock-adapter shape from the
   contract (§3.10): `{metrics, employees, onboardingRequests,
   offboardingRequests, leaveRequests, holidays}` with the arrays in
   camelCase UI shapes.
5. **Document `type` is a free string** (no enum); leave `duration` is
   computed server-side for employee self-service creates (working days,
   excluding weekends and holidays, half-days = 0.5) and taken as given
   for HR creates.

## Notes / limitations

- Workflow steps/assignments are stored as JSON on `workflow_instances`
  (no separate steps/assignments tables); history is derived from
  `workflow_actions`.
- Manager scoping: HR sees everything; managers see their department +
  reporting subtree; employees see only their own records.
- Sensitive fields (national ID, passport, emergency contacts) are
  returned as stored; field-level redaction per role is not yet
  implemented — add it before exposing the API beyond trusted HR users.
- Payroll, Recruitment, Attendance, Performance, Training, Calendar,
  Reports, Settings, Automations and Intelligence/Ask have no API
  surface in the frontend (mock/local only) and are out of scope here.
