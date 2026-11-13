# Handoff — Backend support for the frontend request doc (#1–#7)

## Branch
`feature/backend-frontend-request` — pushed to origin, not merged into `main`. The frontend base was restored from `origin/feature/pm-checklist-audit-diff` (`88dde7b`).

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
- Still failing, pre-existing and unrelated (109 tests): `api.service.spec`, `auth.service.spec`, `pm.service.spec`, `pm-assign.component.spec` and the "Checklist" block of `pm-create.component.spec`. They were written for the old in-memory mock API, call the live backend at `10.144.15.76:3000` and get 401. Deliberately not fixed: logging in would make them create/delete tasks in the shared dev DB; they need rewriting against a fake API (like `master-plan-api.fake.ts`).

## Deployed (dev)
- Applied to dev DB `KETL_Tester` (each script in its own transaction; never use `prisma migrate` / `db push`): `add-machine-lifecycle-fields`, `create-pm-id-sequences-table`, `add-audit-changes-column`, `create-masterplan-tables`, `create-pm-types-table`.
- `cmms-backend` rebuilt with `docker compose up -d --build backend` (from `backend/`); all new routes mount under `/api/v1`; unauthenticated calls return 401.
- Applied `trim-pm-task-overgeneration.sql` on the user's approval: deleted exactly 24,804 far-future Pending rows (tasks 26,563 → 1,759; latest Pending due now 2027-11-13). The deleted rows are backed up as JSON in the Copilot session `files/trimmed-pm-tasks-backup.json` (not in the repo).
- `create-pm-types-table.sql` backfill report: legacy duplicate monthly schedules for `SRV-P2-01` (3) and `THC-P1-01` (6); only the earliest got a claim. **Resolved:** the 7 non-claim Monthly schedules were set `is_active=0` and their 84 untouched Pending tasks were Cancelled (reason `Duplicate schedule`). In Progress / Overdue / Done tasks were kept as history. Backup: session `files/dedup-backup.json`. The schedule that holds the PM-type claim stays active.
- Fixed a Master Plan version label collision: labels were derived from the row count, so after a version was deleted the next approve silently returned no `revision`. `nextVersionLabel()` now skips taken labels. Verified live.
- `cmms_pm_tasks.id` is NVARCHAR(1000), so the long task ids fit.

## Next steps
0. Browser check done (admin, `npm start` on 4300 against the dev backend): login → dashboard, Manage Machines (real data, Active / In plan chips, no mock toggle), Master Plan Approvals (empty state, no dev seed button), Master Plan and Create PM routes load; no console/page errors. The only 401s are the pre-login data load on the login page. No CMMS frontend is hosted on this machine (nginx only proxies the backend), so "deploying" the frontend means running `cd frontend && npm start` or building with `npm run build` and hosting `dist/` where the team serves it. Not exercised in the browser: add machine / Send / approve clicks, technician and engineer views.
1. ~~Smoke-test Master Plan end to end~~ Done against the dev backend, twice (18/18 and 21/21; test data removed afterwards). Covered: engineer create asset → draft PM type → Send card → admin approve → tasks generated with new ids and bounded horizon → duplicate PM 409 → deactivate card → approve → open tasks Cancelled; technician 403 on changes; engineer cannot approve/reject (403); merge of two edits into one card; duplicate pending add 409; withdraw (twice → 404/409); reject needs a reason, double reject 409; approve applies edits and adds Quarterly tasks next to Monthly; no-op edit dropped; unknown id reports a per-id error. Test accounts: `ADM001`/`ENG-TST-1`/`TECH-TST-1` (see `backend/test/*.e2e-spec.ts`).
2. ~~DB team: resolve the duplicate schedules~~ Done (see Deployed).
3. Open a PR / merge into `main` when the team agrees. The branch is pushed; `main` was deliberately not touched. `/code-review` against `main` was skipped at the user's request.
4. Dev data created by the user while trying the app (left untouched): machine `CGT-001` (in plan, approved card `MPC-1794543400963-615`, 12 tasks) and Master Plan version `B`.

## Known issues / deferred
- `PUT /pm-tasks/schedule/:seriesId` now rejects technicians unless they hold a `pm.create.submit` or `pm.assign.submit` delegation on the product (fixed, redeployed, verified live: technician 403, admin 200).
- Submit/merge of a Master Plan card is a read-modify-write (no locking).
- A paused deactivated asset's PM-type claim remains.
- Frontend `PmStore.loadData()` now keeps Done history already loaded (fixed, `pm-store.service.spec.ts`).
- `isLocalOnly` on `Asset` and its handling in `pm-plan.util.ts` (`mergeLoadedAssets`) are now orphaned; left in place.
- `api.service.spec.ts` (~l.107/141) asserts the old task id format `PM-FAC-\d{4}`; the new format is `PM-{assetId}-{periodCode}-{seq}`. The spec is a live-backend test, so it was not touched.
- Pre-existing: `Rolling Due Dates on Approval` e2e fails by 1 day on some dates (`calculateDatesFromAnchor()` in `cmms.service.ts`).

## Anti-patterns
- Plain `npx tsc --noEmit` in `frontend/` checks nothing; use `-p tsconfig.app.json` / `-p tsconfig.spec.json`.
- Under `isolatedModules` + `emitDecoratorMetadata`, interface-typed decorated controller params must be typed `any`.
- Component specs run the real `MasterPlanService` against `master-plan-api.fake.ts`; the service methods are async, so `await` them in specs and let `settle()` flush timers.
- Don't run e2e specs casually: they hit the shared dev DB.
