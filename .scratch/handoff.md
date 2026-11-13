# Handoff — Backend support for the frontend request doc (#1–#7)

## Branch
`feature/backend-frontend-request` — not merged, not pushed. Backend commits `3a32672`…`4827585`, frontend commit `9735234`. The frontend base was restored from `origin/feature/pm-checklist-audit-diff` (`88dde7b`).

## What was done
Implemented topics #1–#7 of `backend_fixes_needed_combined 2 1.html` (repo root, untracked) and rewired the frontend.

Backend:
- Schedule horizon + idempotent `topUpSchedules` (no more +1yr nightly overgeneration); `frequency.util.ts`.
- Atomic task ids `PM-{assetId}-{periodCode}-{seq}`.
- PM-type claim table: one PM per asset+frequency, 409 body with a `conflict` object; removing a PM type releases its claim.
- Engineers can `POST /products`.
- `PATCH /assets/:id` deactivate/reactivate cascade; cancelled tasks are terminal.
- Checklist diff in `AuditLog.changes`; a schedule update cascades to non-finished tasks.
- Master Plan: `GET/POST /pm-masterplan/changes`, `/approve`, `/:id/reject`, `/:id/withdraw`, `GET /pm-masterplan/versions`; draft PM types under `/assets/:id/draft-pm-types`. Technicians get 403. Send (`addToPlan:true`) builds its PM types from the server-side drafts.
- Docs in `.github/instructions/backend.instructions.md`.

Frontend:
- `MasterPlanService` now calls the API (write-through, then re-sync). `load()` runs after `pmStore.loadData()` in `app.config.ts` and `login.component.ts`, and on entering Approvals.
- Removed: the dev mock seed/toggle, local reconcile logic (`pm-masterplan-mock.ts`, `pm-masterplan-reconcile.util.*`), `localAuditLogs`, and the old 1721-line `pm.service.master-plan.spec.ts` (logic now lives in the backend tests).
- New: `api-error.util.ts`, `master-plan.service.spec.ts` (API wiring), `master-plan-api.fake.ts` (backend fake for component specs).
- Create PM now ignores a second submit while the first is running. `'1 week(s)'` counts as Weekly.

## Verification
- Backend: `npx tsc --noEmit` clean; `npx jest src` 12 suites passing.
- Frontend: `npx tsc --noEmit -p tsconfig.app.json` and `-p tsconfig.spec.json` clean. `npm test`: pm-approvals, pm-machines, master-plan.service and others pass.
- Still failing, pre-existing and unrelated: `api.service.spec`, `auth.service.spec`, `pm.service.spec`, `pm-assign.component.spec` and the "Checklist" block of `pm-create.component.spec`. They call the live backend at `10.144.15.76:3000` and get 401.

## MUST DO BEFORE DEPLOYING THE BACKEND (none applied to the dev DB yet)
Apply these in `backend/prisma/manual-sql/` first (the running Docker `cmms-backend` uses the old client until rebuilt). Never use `prisma migrate` / `db push`:
1. `add-machine-lifecycle-fields.sql`
2. `create-pm-id-sequences-table.sql`
3. `create-pm-types-table.sql`
4. `add-audit-changes-column.sql`
5. `create-masterplan-tables.sql`
6. `trim-pm-task-overgeneration.sql` — cleanup; dry-run first, via the DB team.

## Next steps
1. Ask the user to approve applying the SQL scripts, then rebuild/redeploy `cmms-backend`, then smoke-test Master Plan end to end (approve/merge are only mock-tested).
2. Merge/push when the user is satisfied (feature workflow: self-review with `/code-review` against `main` first).

## Known issues / deferred
- `PUT /pm-tasks/schedule/:seriesId` has no technician role block (pre-existing; more impactful now that checklist edits reach in-flight tasks).
- Real `cmms_pm_tasks.id` column length vs the new long ids is unverified.
- Submit/merge of a Master Plan card is a read-modify-write (no locking).
- A paused deactivated asset's PM-type claim remains.
- `PmStore.loadData()` loads tasks excluding Done, so a reload (e.g. after approve) drops loaded Done history.
- `isLocalOnly` on `Asset` and its handling in `pm-plan.util.ts` (`mergeLoadedAssets`) are now orphaned; left in place.
- `api.service.spec.ts` (~l.107/141) asserts the old task id format `PM-FAC-\d{4}`; the new format is `PM-{assetId}-{periodCode}-{seq}`. The spec is a live-backend test, so it was not touched.
- Pre-existing: `Rolling Due Dates on Approval` e2e fails by 1 day on some dates (`calculateDatesFromAnchor()` in `cmms.service.ts`).

## Anti-patterns
- Plain `npx tsc --noEmit` in `frontend/` checks nothing; use `-p tsconfig.app.json` / `-p tsconfig.spec.json`.
- Under `isolatedModules` + `emitDecoratorMetadata`, interface-typed decorated controller params must be typed `any`.
- Component specs run the real `MasterPlanService` against `master-plan-api.fake.ts`; the service methods are async, so `await` them in specs and let `settle()` flush timers.
- Don't run e2e specs casually: they hit the shared dev DB.
