# Handoff — Session 2026-08-06 (cont'd): API Guide Verification — Report Ready, One Blocker Remains

## Branch
`feature/update_feature_frontend` — not merged, no code changes made this session or the prior one (read-only testing/diagnosis task, per explicit user instruction). Working tree unchanged from before (same pre-existing uncommitted items: `.scratch/handoff.md`, untracked `PM_example.pdf`, `docs/project-timeline.html`, `frontend/src/assets/`, `node_modules/`, root `package.json`).

## What was done this session

Continuation of the prior in-progress API verification session. Completed all remaining safe automation steps from that handoff's "next steps" list:

1. **Cleaned up the leftover delegation** from the prior session (`POST /delegations` engineer -> `TECH-TST-2`/`CUST-001`, id `9598d415-f966-4012-9925-595be9f37acc`) — found via `GET /delegations` and revoked via `PATCH /delegations/:id/revoke`. Confirmed `status: "revoked"` afterward.

2. **Root-caused the `POST /pm-tasks` 400 mystery** (previously suspected to be a PowerShell `ConvertTo-Json` array-serialization quirk — that theory was **wrong**). Ran the exact failing request directly and captured the real error body via `$_.ErrorDetails.Message`:
   `"Asset location (CUST-002) does not match product (CUST-001)"`
   Root cause: the test script used `assetId="AC-P2-01"` with `productId="CUST-001"; department="Test"`, but per `backend/prisma/seed.ts`, asset `AC-P2-01` ("Air Compressor AC-2") actually belongs to `CUST-002`/`Mechanic`. This was a **bad test fixture, not a backend or serialization bug**. Corrected fixture: `assetId="CAL-P1-01"` (Calibration Bench #1, correctly seeded under `CUST-001`/`Test`).

3. **Fixed `.scratch/api-test/full-api-test.ps1`**:
   - Corrected the PM task asset fixture to `CAL-P1-01`.
   - Corrected expected status codes: `DELETE /pm-tasks/:id` and `DELETE /templates/:id` return **204** (No Content), not 200 — the original script's assertions were wrong, not the API.
   - Fixed `POST /delegations` response-shape parsing: the endpoint returns a bare array of created delegation records, not `{ delegations: [...] }` — corrected to `$delResp[0].id`. This is why the revoke cleanup 404'd in the previous run.
   - **Removed the live `POST /products` (engineer -> expect 403) test** and replaced it with a comment explaining why: there is no `DELETE /products` endpoint, so a 201 response (which is what actually happened previously) creates permanent, unremovable pollution. Per the anti-pattern already logged from the prior session, this must not be repeated automatically — see "Known issues" below.

4. **Re-ran the corrected `full-api-test.ps1`**: **36/36 pass**, including the two intentionally-known-stale-deploy markers (`POST /pm-tasks/schedule` -> 404, `GET /audit-logs` as admin -> 403) which are annotated as expected-known-issues, not failures. Full PM task lifecycle (create -> get -> put -> delete-forbidden-as-engineer -> delete-cleanup-as-admin) and template/delegation lifecycles all self-clean correctly now. Verified via follow-up `GET /pm-tasks` and `GET /products` that no new test pollution remains **except** the pre-existing `APITEST-SKIP` product row (see below, unresolved).

5. **Definitively confirmed the `POST /products` authorization gap — no longer a theory.** Re-sent the exact same `POST /products` call (engineer, id `APITEST-SKIP`) a second time. Because that id already exists from the prior session, this could not create any new pollution: per `backend/src/products.controller.ts`'s current source, the role guard (`admin`/`manager` only) runs *before* the duplicate-id check, so if the role guard were active it would throw `403` first. It instead returned **409 Conflict** (`"Product with ID 'APITEST-SKIP' already exists"`), which only happens if the request reached the duplicate-id check — meaning **the role guard did not run at all**. This conclusively confirms the shared server's deployed `products.controller.ts` predates the admin/manager-only restriction; it is a genuine stale-deploy gap (any engineer/technician can currently create products on the live shared server), not a one-off fluke.

## In-flight / next steps

1. **BLOCKED on user/DB-access — `APITEST-SKIP` product cleanup.** The row (`cmms_products.id = 'APITEST-SKIP'`, plus a linked `cmms_user_owned_products` row for `ENG-TST-1`) is still present on the shared dev DB. There is no API path to delete it, and this agent has **no DB credentials** (`backend/.env` / `DATABASE_URL` do not exist locally — confirmed by grepping for any connection string in the repo). Someone with direct DB access must run:
   ```sql
   DELETE FROM cmms_user_owned_products WHERE product_id = 'APITEST-SKIP';
   DELETE FROM cmms_products WHERE id = 'APITEST-SKIP';
   ```
2. `POST /products` role-enforcement gap is now **confirmed** (see above) — this is real, reproducible, and worth escalating to whoever manages the shared server deployment, not just a documentation/staleness footnote. Recommend flagging it as a priority redeploy item alongside the other two known stale-deploy issues.
3. The final endpoint-by-endpoint report can be delivered as-is once the DB cleanup is scheduled — all other findings are already fully confirmed and stable:
   - Frontend `hasPermission('pm.audit.view')` excludes admin (bug, diagnosed only, not fixed — needs Grill->Spec->Tickets cycle).
   - `docs/api-guide-for-frontend.html` incorrectly claims `GET /templates` is admin/manager-only (guide bug, actual behavior is open to all authenticated roles, department-scoped) — ask user if they want the doc corrected.
   - Shared server staleness (all three confirmed): `POST /pm-tasks/schedule` -> 404 (route missing), `GET /audit-logs` as admin -> 403 (old role-check still deployed), `POST /products` -> missing admin/manager-only guard entirely.
4. No code fixes should be made without going through Grill -> Spec -> Tickets -> Branch per the mandatory project workflow — this and the prior session's job was strictly test + report.

## Known issues / deferred work

- `cmms_products` / `cmms_user_owned_products` pollution (`APITEST-SKIP`) — unresolved, blocked on DB access (this agent has none; see SQL above).
- Shared server (`10.144.15.76:3000`) redeploy still pending — **three confirmed** stale-behavior instances relative to current backend source: missing `/pm-tasks/schedule`, blocking admin on `/audit-logs`, and not enforcing admin/manager-only on `POST /products` (all three re-verified/confirmed this session, not just suspected).
- `backend/.env` still missing locally (unchanged, not required for shared-server-only testing).
- 4 pending manual SQL migration scripts in `backend/prisma/manual-sql/` — still unconfirmed against the real DB, untouched again this session.

## Anti-patterns to avoid

### Don't blame PowerShell serialization before checking the actual error body
The prior session assumed `ConvertTo-Json`'s empty-array-to-`null` quirk caused a 400 on `POST /pm-tasks`, and left it as an open theory without confirming. The real cause was an unrelated bad test fixture (wrong `assetId` for the given `productId`/`department`). Always capture `$_.ErrorDetails.Message` (or read the response stream) and read the actual message before attributing a failure to a suspected serialization/environment quirk — in this run, `ConvertTo-Json` correctly serialized `@()` as `[]`, not `null`, so that specific PowerShell quirk wasn't even in play here on this PowerShell version.

### When a test's cleanup step fails, verify the response shape before assuming the delete/revoke endpoint is broken
The delegation revoke cleanup 404'd not because `PATCH /delegations/:id/revoke` was broken, but because the test script guessed the wrong JSON shape for `POST /delegations`'s response (assumed `{ delegations: [...] }`, actual is a bare array). Check the controller source (or log the raw response body) before writing assertions against a response shape you haven't confirmed.

## TypeScript / build status
Not re-checked this session (no code changes made to `frontend/` or `backend/` source — only `.scratch/api-test/*.ps1` test scripts were edited). Per last confirmed check: `frontend: npx tsc --noEmit` — 0 errors; `backend: npx tsc --noEmit` — 0 errors.
