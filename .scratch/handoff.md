# Handoff — Session 2026-11-12: 3-role E2E test + Record PM error handling

## Branch
`feature/pm-checklist-audit-diff` — not merged, **nothing committed**. Ask the user before committing or pushing.

## Done
- Ran a full E2E (Engineer, Manager, Technician agents) on the shared dev server (`http://10.144.15.76:3000`). Data used: `E2E-1112`, dept Test, CUST-002.
- Flow verified: add machine → Create PM request → Manager approve → server task `PM-TES-18907` → assign → technician submit → engineer approve (Done, `approvedBy` ENG-TST-1).
- Fixed `frontend/src/app/pages/pm-record/pm-record.component.ts`:
  - `submitRecord` / `rejectRecord` now await `updateTask` and show a red toast on failure (no green toast before the API succeeds).
  - Empty technician notes no longer create a blank `[Tech|ts]:` entry.
- Type-check (app + spec) passes; lint 0 errors (11 existing warnings in that file).
- Backend note written: `.scratch/backend-note-e2e.md`.

## Main finding (backend)
`createdBy` becomes the approving manager (`PmTasksController` hard-codes `user.employeeId`). The user wants Created By = the requesting engineer. Needs a backend fix. The frontend already sends `createdBy`.

## Not fixed (frontend, low priority)
- The approval card shows little detail and Approve has no confirmation.
- Logout icon is hidden when the sidebar is collapsed.
- `/pm-audit`, `/pm-machines` and `/pm-create` Access Denied pages don't redirect to `/unauthorized`.
- Created-PM task title is the machine name.
- Assign PM with ~25k rows is heavy (crashed an automation browser).
- Possible post-login race (full sidebar and one 401 before reload) — unconfirmed.

## Test data on the server (admin must delete)
`PM-TES-18907`, `PM-TES-18309`, machine `E2E-1112-M1`.

## Known backend gaps
`/pm-masterplan*`, `/assets/:id/draft-pm-types` and `PATCH /assets/:id` return 404. The asset payload lacks `workCenter`/`isActive`. Nightly duplication, PM ID format and the unique-PM-type constraint are still open. Master Plan state is memory-only, so don't reload mid-test.

## Test logins
`ENG-TST-1`/`eng123`, `MGR001`/`mgr123`, `TECH-TST-1`/`tech123`.
