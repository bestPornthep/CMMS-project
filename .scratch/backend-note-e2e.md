# Backend note — E2E findings (3-role simulated test on shared dev server)

## Must fix
1. **`createdBy` is the approving manager, not the requesting engineer.**
   `PmTasksController.create` and `createSchedule` hard-code `createdBy: user.employeeId`.
   The frontend already sends `createdBy` (submitter) but the DTO has no such field and it is ignored.
   Fix: accept/persist the submitter as `createdBy`, set `approvedBy` = approving manager.
   Evidence: `PM-TES-18907` (`createdBy: MGR001`, requested by `ENG-TST-1`). Assign PM "Created By" shows the manager.
2. **Server `/audit-logs` has no entries** for create / assign / approve of `PM-TES-18907`.
   Master Plan audit entries exist only as local `LOCAL-…` ids and vanish on reload.
3. **Missing endpoints (404):** `/pm-masterplan*`, `/assets/:id/draft-pm-types`, `/pm-schedules`, `PATCH /assets/:id`.
   Master Plan state (requests, approvals, drafts) is memory-only in the frontend until these exist.
4. **Asset payload lacks** `workCenter`, `isActive`, `isInMasterPlan` (work center shows "—" after reload).
5. `GET /pm-tasks` ignores `?assetId=`.

## Earlier handoff items still open
Nightly task duplication, PM ID format, unique PM-type constraint.

## Test data to delete (admin only; MGR001 gets 403)
- Task `PM-TES-18907`, machine `E2E-1112-M1` (CUST-002, dept Test), task `PM-TES-18309`.

## Frontend observations (not backend)
- Task `title` for an approved Create PM is the machine name; PM title only lands in `description`.
- Tech dropdown can show workload >100%.
- Record PM list is stale across browsers until reload (store refetches only on login/reload).
- Assign PM (~25k rows) crashed a Chromium renderer under automation — needs virtualization/pagination.
- Post-login without reload: possible 401 + full sidebar once.
