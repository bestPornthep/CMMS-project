# Handoff — Session 2026-08-20: 6 Backend Requirements for Checklist/Photo/PM/User-Management Features

## Branch
`update_feature_fullstack` — not merged to `main`. Fully pushed to `origin/update_feature_fullstack` (no local commits ahead, no divergence). Latest commit: `d5c633c`.

## What was done this session

### Branch sync (before any feature work)
- Frontend team had pushed 5 new commits directly to `origin/update_feature_fullstack` (calendar modal, reassign-cascade UI, rolling-due-dates design docs, PM Create start-date UI) since the last session, while local `update_feature_fullstack` also had 1 unpushed commit (`7a5d618`, the recurring-assignment fix from the prior session). Rebased local onto origin cleanly (no conflicts) — that commit is now `cb27025`.
- Frontend also had a separate branch `feature/checklist-value-and-real-photo` (forked from an older point, `e66aeab`) containing two fully-shipped frontend features (checklist `requiresValue` free-text field, real camera-only photo capture) plus a third bundled-in WIP commit (`60de312`) with the Profile Config admin user-management page. Merged this into `update_feature_fullstack` as `aff2545` — one conflict, in `.scratch/handoff.md` only (docs, not code), resolved by keeping the merged/newer version and dropping a stale pre-existing uncommitted draft that had been sitting unstaged since a prior session.
- Post-merge `npx tsc --noEmit` (backend + frontend) — 0 errors both, confirming the merge itself introduced no breakage before any new feature work started.

### 6 backend features implemented, per 6 spec docs the frontend team dropped in `docs/backend_*.html`
All committed together in `d1070c7`:

1. **`docs/backend_checklist_value_record.html`** — added `requiresValue?: boolean` to `ChecklistItemDto` in `backend/src/dto/create-pm-task.dto.ts` (was being silently stripped by the whitelist `ValidationPipe` on one-time task create).
2. **`docs/backend_real_photo_upload.html`** — `backend/src/main.ts` now calls `app.useBodyParser('json', { limit: '10mb' })` / `useBodyParser('urlencoded', ...)` (required retyping `NestFactory.create<NestExpressApplication>` — the generic `INestApplication` type doesn't expose `useBodyParser`). Base64 checklist photos were 413ing against Express's 100kb default. The doc's deferred multipart-upload endpoint was explicitly out of scope — not built.
3. **`docs/backend_pm_create_start_date.html`** — `createSchedule()` in `backend/src/pm-tasks.controller.ts` accepts optional `body.startDate`, rejects past dates (day-granularity, 400), and prepends it as task #1's exact due date (`dates = [startDate, ...calculateDates(frequency, startDate)]`). **Note:** this changes behavior even when `startDate` is omitted — previously `calculateDates(frequency)` with no start date returned only future occurrences (task #1 = today + 1 interval); now it always prepends the anchor date, so task #1 = today exactly, task #2 = today + 1 interval. The doc claims this is "identical to today's behavior" when omitted — it isn't quite, but this is the literal code the doc specifies, so it was implemented as written. Confirmed real via the pre-existing T4 e2e test, which had to be updated (see below).
4. **`docs/backend_pm_reassign_api.html`** — new `PUT /pm-tasks/:id/reassign` endpoint in `pm-tasks.controller.ts`: reassigns the clicked occurrence, cascades to every other `Pending` sibling in the same series (falls back to the legacy `[SeriesID: xxx]` description-marker match for series with no `scheduleId`), and updates `PmSchedule.assignedTo` — all in one `$transaction`. Added `PmTask.reassignCount Int @default(0)` to `schema.prisma` + `backend/prisma/manual-sql/add-pm-task-reassign-count.sql`. Added a shared `extractSeriesIdFromDescription()` helper to `CmmsService` (used by both this and feature 5) since no such helper existed yet despite the docs assuming one.
5. **`docs/backend_pm_rolling_due_dates.html`** — hooked into the existing `update()` approve path in `pm-tasks.controller.ts`: when `body.status === 'Done'` and `approvedAt` is actually set (and wasn't already `Done`), recalculates every remaining `Pending` sibling's `nextDueDate` anchored off the approval time. Extracted `getFrequencyIncrementFn()` out of `CmmsService.calculateDates()` and added `calculateDatesFromAnchor()` alongside it so both paths share the same per-frequency date math, per the doc's explicit instruction not to duplicate it.
6. **`docs/backend_profile_config_users.html`** — `backend/src/users.controller.ts` gained `POST /users` (admin-only, 409 on duplicate `employeeId`, technician-by-default creation), and `isActive` is now accepted on `PATCH /users/:id` and returned by both `GET /users` and `GET /users/:id`. Added `User.isActive Boolean @default(true)` to `schema.prisma` + `backend/prisma/manual-sql/add-user-is-active.sql`. `backend/src/auth/auth.service.ts` `login()` now rejects deactivated accounts with 401 before even checking the password.

### Database migrations — applied, not just written
Both new `manual-sql/*.sql` scripts were actually run against the live dev DB (`KETL_Tester`) via `npx prisma db execute --file <path>` (Prisma 7 CLI reads the datasource from `prisma.config.ts`, not a `--schema` flag — that flag no longer exists and will error). `npx prisma generate` was re-run after each `schema.prisma` edit so the Prisma Client picked up `reassignCount` / `isActive` before `tsc` would pass.

### Testing
- Added 16 new e2e regression tests to `backend/test/api-smoke.e2e-spec.ts`, self-contained fixtures + `afterAll` cleanup, one describe block per feature (`Profile Config user management`, `PM Task Reassignment (Series Cascade)`, `Rolling Due Dates on Approval`, plus inline tests for `requiresValue` passthrough and start-date validation in the existing `PM Tasks` block).
- Updated one pre-existing assertion: the T4 test `POST /pm-tasks/schedule creates a PmSchedule row plus its task(s)` expected `res.body.length` to be `1` for a `6 month(s)` schedule with no `startDate`; it's now `2` per the intentional behavior change in feature 3 above.
- Full result: **61/61 e2e tests passed** (`api-smoke`, `pm-templates`, `app` specs), backend unit tests 1/1 passed, `npx tsc --noEmit` 0 errors.

### Live deployment
- Added `backend/.dockerignore` (excludes `node_modules`, `dist`, `.git`, `coverage`) — this was a known issue flagged in the prior handoff (build tarring ~530MB context, ~8 min rebuilds) and directly blocked this session's redeploy, so it was fixed now rather than deferred again. Committed separately as `d5c633c`.
- Rebuilt (`docker compose build backend`, now much faster) and redeployed (`docker compose up -d --no-deps backend`) the live `cmms-backend` container on this host (currently at LAN IP `10.144.15.22` — **note this differs from `10.144.15.76` referenced in older docs/handoffs**; re-confirm the current IP each session, it appears to change).
- Verified live post-deploy: login works, `GET /users` returns the new `isActive` field, container logs show `PUT /api/v1/pm-tasks/:id/reassign` registered. Sibling containers (`spare-parts-*`, `git-mirror`, `nginx-proxy`) confirmed untouched (`--no-deps` worked as intended).

## In-flight / next steps

1. **No PR opened yet** for `update_feature_fullstack` → `main`. Next session should check with the user whether/when to open one — this branch now contains a large batch of both frontend and backend work across multiple sessions.
2. **Frontend was not re-verified this session** beyond the immediate post-merge `tsc --noEmit` check — no new frontend code was touched, but the frontend team's own in-flight UI for reassign-cascade/rolling-due-dates/profile-config (already on this branch from their commits) has not been manually smoke-tested end-to-end against the newly-deployed backend endpoints. Worth a quick manual pass before considering this batch fully done.
3. **The dedicated photo-upload endpoint** (`POST /pm-tasks/:id/checklist/:index/photo`, multipart/multer-based) described in `docs/backend_real_photo_upload.html` was explicitly marked deferred/optional in that doc and was not built — only the interim body-size-limit fix was. Revisit if/when photo storage growth becomes a real problem (base64-in-JSON-column is the doc's own stated interim tradeoff).
4. **Two untracked HTML report files at repo root** (`backend-change-request.html`, `technician-visibility-bug.html`) are still sitting there, undecided across three sessions now (leave as-is / delete / move into `docs/`). Raise with the user directly next time rather than deferring again.

## Known issues / deferred work

- `PUT /templates/:id` backend endpoint still missing — required by frontend (carried from prior handoffs, not touched this session).
- `POST /products` still does not assign creator ownership rows for all cases — not touched this session.
- `[SeriesID: xxx]` in task descriptions remains the legacy series-matching fallback; both new features this session (reassign cascade, rolling due dates) correctly implement the same `scheduleId`-first / description-marker-fallback pattern as existing code, but the underlying migration-to-`pm-schedules`-only debt is unchanged.
- The new `extractSeriesIdFromDescription()` helper in `CmmsService` is used by 2 of the 3 legacy-fallback call sites in `pm-tasks.controller.ts` (reassign, rolling-due-dates); the pre-existing `updateSchedule()` legacy fallback still does its own inline `description.contains` match since it already has the `seriesId` from the URL param and doesn't need extraction — this is intentional, not an oversight, but worth knowing they're not literally unified into one code path.
- `backend/prisma/schema.prisma` is a very large generated-looking file (3000+ lines) — only the `User` and `PmTask` models were touched this session; did not audit the rest of the file for drift against the live DB.

## Anti-patterns to avoid

### Prisma 7 CLI dropped `--schema` from `db execute`
Older sessions' manual-sql scripts document `prisma db execute --file ... ` without ever showing the exact CLI invocation used. This session first tried `--schema ./prisma/schema.prisma` (matching very common Prisma docs/examples) and got a hard CLI error: `unknown or unexpected option: --schema`. In this repo's Prisma 7 setup, the datasource is read from `prisma.config.ts` automatically — just run `npx prisma db execute --file <path>` with no `--schema` flag. Check `prisma.config.ts` exists before assuming any particular CLI flag shape; don't copy flag syntax from general Prisma docs without verifying against the installed version.

### `NestFactory.create(AppModule)` return type doesn't expose Express-specific methods
`app.useBodyParser(...)`, `app.useStaticAssets(...)`, etc. live on `NestExpressApplication`, not the generic `INestApplication` that `NestFactory.create()` returns by default. Fix is `NestFactory.create<NestExpressApplication>(AppModule)` (import `NestExpressApplication` from `@nestjs/platform-express`) — a plain type-only change, no runtime behavior difference since the underlying app is already Express-based via `@nestjs/platform-express`.

## TypeScript / build status

`npx tsc --noEmit` (backend) — 0 errors
`npx tsc --noEmit` (frontend) — 0 errors (checked once, right after the merge; not re-checked after backend-only changes since none touch frontend code)
Backend e2e (`npx jest --config ./test/jest-e2e.json`) — 61/61 passed
Backend unit (`npm test`) — 1/1 passed
Live `cmms-backend` container — rebuilt, redeployed, verified responding correctly at `10.144.15.22:3000`
