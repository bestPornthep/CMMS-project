# Handoff — Session 2026-08-13: PM Reassign + Rolling Due Dates — design done, frontend-only build started

## Branch
`update_feature_fullstack` — **not committed, not pushed**. Working directly on this branch (up to date with `origin/update_feature_fullstack` at commit `0ec4262`), no dedicated feature branch created yet this session.

**⚠️ Before committing anything:** this branch currently has *staged* deletions (not from this session, present since before this session started) of `CLAUDE.md`, `CONTEXT.md`, `backend_schedule_spec.md`, `backend_spec.md`, `docs/adr/0001-eager-delegation-lookup.md`, `docs/api-guide-for-frontend.html`, `docs/backend_assets_products_api.md`, `docs/backend_template_api.md`. Flagged to the user twice this session with no response/resolution yet. **Do not include these in a commit via `git add -A`** — stage only the files listed below explicitly, unless the user has since confirmed the deletions are intentional.

## What was done this session

### 1. Small frontend tweaks (Assigned PMs tab, `pm-assign.component.html`)
- Removed the "Due Date" column from display only — `nextDueDate` is still fetched/sent as before, just not rendered in this table.
- Added a new "Action" column showing `Reassign #N` (or `—`) driven by a new `reassignCount?: number` field added to `PMTask` (`frontend/src/app/core/models/pm.model.ts`).

### 2. Two features designed and documented, NOT yet backend-implemented
- **PM Task Reassignment (series cascade)** — [docs/backend_pm_reassign_api.html](../docs/backend_pm_reassign_api.html) (v2, supersedes an earlier single-task-only version the user undid). New dedicated endpoint `PUT /api/v1/pm-tasks/:id/reassign`: reassigning one occurrence (only allowed from `In Progress`/`Overdue`, never `Pending Approval`/`Done`) cascades `assignedTo` to every other still-`Pending` sibling in the series in one transaction, plus updates `PmSchedule.assignedTo` so future cron-generated rows follow too. Requires a new `reassignCount Int @default(0)` column/migration on `PmTask` — that's what the new Action column reads.
- **Rolling Due Dates on Approval** — [docs/backend_pm_rolling_due_dates.html](../docs/backend_pm_rolling_due_dates.html). Fully independent from reassign (confirmed explicitly by the user — do not conflate). Every time any task in a series is approved, recalculate `nextDueDate` for all remaining `Pending` siblings as `approvedAt + N×frequency`. Hooks into the *existing* generic `PUT /api/v1/pm-tasks/:id` approve path as a side effect — no new endpoint. Repeats on every approval, forever. Rejecting never triggers it.
- Both docs are meant to be handed to whoever builds the backend piece (dedicated `.html` requirement docs, matching this repo's existing pattern for backend-team handoff docs).

### 3. Frontend-only build of Reassign UI (backend does not exist yet — will 404 live)
Files: `pm-assign.component.ts`, `.html`; `pm.service.ts`; `api.service.ts`; `translation.service.ts`.
- `canReassign(task)`: true only for `In Progress`/`Overdue` + `canManageTask()`.
- `getReassignTechnicians(task)`: same dept-scoped list as `getTaskTechnicians()`, minus whoever is currently assigned.
- New per-row dropdown + Confirm button in the "Assigned To" cell (only rendered when `canReassign()`), reusing the `.c-dropdown` pattern; centered under the tech name via explicit `justify-content:center` (a bare `display:flex` div does NOT inherit centering from an ancestor's `text-align`).
- Confirm opens a modal (reused Bulk-Assign-modal pattern) — "You are reassigning X from A to B" — before calling `pmService.reassignTask(task, newTech)` → `ApiService.reassignTask()` → `PUT /api/v1/pm-tasks/:id/reassign`.
- `PmService.reassignTask()` refetches the full task list afterward (`api.getTasks()`, no filters) rather than patching one row in place, since the backend cascade can touch sibling rows — same pattern already used by `addPmSchedule()`/`updatePmSchedule()`.
- All new UI strings translated (Thai) in `translation.service.ts`: `Confirm Reassignment`, `You are reassigning`, `from`, `to`, `Reassign...`, `Reassign`, `Select Tech...`.

### 4. Reference doc (not tied to reassign specifically)
- [docs/pm_task_lifecycle_diagram.html](../docs/pm_task_lifecycle_diagram.html) — full code-verified PM lifecycle (create → unassigned → assign → assigned → record → approve/reject → done), with Mermaid diagrams, scheduler cron behavior, permission matrix, and 2 flagged pre-existing gaps (see below).

### 5. Personal preference recorded
- User dislikes text-heavy `.html` explainer docs — wants Mermaid diagrams/compact tables over prose. Written into the user-level `coding-guidelines.instructions.md` (§6, outside this repo) and into user memory (`/memories/preferences.md`).

## In-flight / next steps

1. **Ask the user how to handle the pre-existing staged deletions** (see warning above) before running any `git add`/`commit` — do not silently include or silently discard them.
2. **Ask the user which branch to push to** — stay on `update_feature_fullstack` directly, or cut a dedicated `feature/pm-reassign` branch first (repo convention prefers a dedicated feature branch; this session never created one).
3. Once branch/staging is resolved: `git add` only the files touched this session (`frontend/src/app/core/models/pm.model.ts`, `frontend/src/app/core/services/api.service.ts`, `frontend/src/app/core/services/pm.service.ts`, `frontend/src/app/core/services/translation.service.ts`, `frontend/src/app/pages/pm-assign/pm-assign.component.ts`, `frontend/src/app/pages/pm-assign/pm-assign.component.html`, `docs/backend_pm_reassign_api.html`, `docs/backend_pm_rolling_due_dates.html`, `docs/pm_task_lifecycle_diagram.html`), commit, then push only after explicit user confirmation (push is a "confirm first" action).
4. **Backend implementation is the actual next feature-build step** — neither doc has been implemented server-side. Reassign endpoint currently 404s against the live/shared backend; the frontend UI is fully wired but non-functional until the backend lands. Build order suggested: Reassign endpoint + `reassignCount` migration first (frontend already expects it), then Rolling Due Dates (pure backend, zero frontend changes needed once done).
5. After backend lands: re-verify the full reassign flow live (single-task and series cascade cases), and confirm `reassignCount` increments correctly on both the primary row and cascaded siblings.

## Known issues / deferred work

- **Done-task immutability gap** (pre-existing, not fixed): `PUT /api/v1/pm-tasks/:id`'s "cannot modify a completed task" guard only fires when the request body includes `status`. A request that changes only `assignedTo` on a `Done` task currently isn't blocked. The fix is already scoped as Rule A in `docs/backend_pm_reassign_api.html` — should be implemented alongside the reassign endpoint, not separately.
- **`Overdue` has no entry in the backend's `TECHNICIAN_ALLOWED` map** (pre-existing, flagged only, not fixed/confirmed as a real bug) — see `docs/pm_task_lifecycle_diagram.html` §11.
- **Bulk Assign modal's own strings** (`Confirm Assignment`, `Confirm`, `Cancel` in that specific modal) still lack `| tr` pipes — pre-existing gap noticed while translating the new Reassign modal, not touched (out of scope, surgical-changes rule).

## Anti-patterns to avoid (NEW this session)

### New UI copy needs `| tr` + a translation.service.ts entry added in the SAME edit, not after
Added the whole Reassign modal/dropdown without any `| tr` pipes on the first pass, because the adjacent pre-existing Bulk Assign modal in the same file is itself untranslated — easy to copy that (wrong) precedent by mistake. Had to circle back after the user pointed it out twice. Check `translation.service.ts` for an existing key before assuming a string doesn't need one, and add both the pipe and the dictionary entry together, immediately.

### `display:flex` children do not inherit an ancestor's `text-align` centering
A flex container is a block box — setting `text-align:center` on a parent centers inline/text content but does **not** center a `display:flex` child as a whole; you need explicit `justify-content:center` on the flex container itself. Caused the new Reassign dropdown+button row to render left-aligned under an otherwise-centered technician name until fixed explicitly.

## TypeScript / build status

`npx tsc --noEmit` (frontend) — 0 errors, last run this session after the translation fix.
No backend changes this session — backend untouched, docs only.
