---
applyTo: "backend/**"
---

# Backend Conventions — NestJS + Prisma + SQL Server

> **Note:** The backend may be out of date relative to the frontend. The frontend is the source of truth for current feature state. When in doubt, read the frontend's `api.service.ts` to understand what endpoints are expected.

## Stack

- **NestJS 11** — controllers + services pattern. No custom providers or complex DI unless necessary.
- **Prisma 7** with **SQL Server (MSSQL)** — not PostgreSQL. The `schema.prisma` datasource is `sqlserver`.
- **JWT auth** via `passport-jwt`. All protected routes use `@UseGuards(JwtAuthGuard)`.
- **Validation** via `class-validator` + `class-transformer`. DTOs live in `backend/src/dto/`.

## Controllers

- One controller per resource (e.g. `pm-tasks.controller.ts`, `templates.controller.ts`).
- Extract the JWT user via `@CurrentUser()` decorator for permission checks.
- Permission checks happen in the controller before delegating to the service.
- Return plain objects — Prisma entities are fine to return directly.

## Prisma / Database

- All CMMS tables are prefixed `cmms_` (e.g. `cmms_pm_tasks`, `cmms_users`).
- **JSON-in-string columns**: `checklist`, `parts`, `permissions` are stored as JSON strings. Always `JSON.parse()` on read and `JSON.stringify()` on write.
- Task IDs follow the pattern `PM-XXX-0001` — generated via `CmmsService.generateTaskId()`. Never generate IDs manually.
- Use `CmmsService.logAudit()` for all significant data mutations (create/update/delete/approve/reject).

## Auth

- Refresh tokens are stored **in-memory** (`Map` in `auth.service.ts`). They reset on server restart — this is a known limitation.
- Delegation lookup is **eager per request** (see `docs/adr/0001-eager-delegation-lookup.md`). Do not cache delegation state between requests.

## Scheduler

- Background jobs in `scheduler.service.ts` run hourly/nightly via `@nestjs/schedule`.
- Do not add new cron jobs without updating `scheduler.service.ts` and the spec docs.

## Known Gaps (do not silently fix without a spec)

- `PUT /templates/:id` endpoint is missing — required by frontend.
- `POST /products` does not assign creator ownership rows — required by `docs/backend_assets_products_api.md`.
- Dual schedule API: `pm-tasks` schedule endpoints + new `pm-schedules` resource coexist. Migration is in progress.
