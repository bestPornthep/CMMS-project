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
- Task IDs follow the pattern `PM-{assetId}-{periodCode}-{seq}` (e.g. `PM-THC-P1-01-1m-01`) — minted atomically via `CmmsService.createTaskInTx()` / `createTaskWithRetry()` (counter table `cmms_pm_id_sequences`). Never generate IDs manually.
- One PM type (asset + normalized frequency) per asset, enforced by `cmms_pm_types`: call `assertPmTypeAvailable` then `claimPmType` inside the same transaction as the create. Conflicts return 409 with `conflict: { taskId, scheduleId, status, assignedTo }`.
- Releasing a PM type (`retirePmType` in `asset-lifecycle.ts`, or `PUT /pm-tasks/schedule/:id {isActive:false}`) deletes its claim so the frequency can be added again; resuming claims it again (409 if re-added meanwhile). Machine deactivate/reactivate (`applyAssetUpdate`) only resumes schedules that still hold a claim.
- Master Plan workflow lives in `masterplan.service.ts` (`/pm-masterplan/*`) and `draft-pm-types.controller.ts` (`/assets/:id/draft-pm-types`). One open card per machine (filtered unique index); approve runs one transaction per machine and creates PMs via `CmmsService.createScheduleInTx` / `createStandalonePmInTx`. A machine with an open Send is read-only (`PATCH /assets/:id` and draft edits return 409).
- Use `CmmsService.logAction()` for all significant data mutations (create/update/delete/approve/reject).

## Auth

- Refresh tokens are stored **in-memory** (`Map` in `auth.service.ts`). They reset on server restart — this is a known limitation.
- Delegation lookup is **eager per request** (see `docs/adr/0001-eager-delegation-lookup.md`). Do not cache delegation state between requests.

## Scheduler

- Background jobs in `scheduler.service.ts` run hourly/nightly via `@nestjs/schedule`.
- Do not add new cron jobs without updating `scheduler.service.ts` and the spec docs.

## Known Gaps (do not silently fix without a spec)

- Schema changes for the legacy shared DB go through `backend/prisma/manual-sql/*.sql` (applied with `prisma db execute`) plus `schema.prisma`. Never use `prisma migrate` / `db push`.
