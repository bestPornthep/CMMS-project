# Handoff — Session 2026-08-29: Login zoneless-signal bug, Record PM scroll fixes, product-create permission investigation

## Branch
`frontend-test-feature` — **not merged**. Branched off `feature/checklist-value-and-real-photo` (which was up to date with `origin/feature/checklist-value-and-real-photo`) and pushed to `origin/frontend-test-feature` this session.

## What was done this session

### 1. Investigated "some Reassign, some can't" for Eng Test C (ENG-TST-3) — not a bug
Reassign visibility is gated in `pm.service.ts` `canReassignTask()`: only shown when `task.status` is `In Progress` or `Overdue`. Pulled live task data from `http://10.144.15.76:3000` and confirmed the tasks that couldn't be reassigned were already `Done` — working as designed (matches `docs/backend_pm_reassign_api.html`'s business rule table: Pending Approval/Done are hard-blocked). **User later confirmed both Reassign and Rolling Due Dates are 100% working end-to-end on the live server** — recorded in `/memories/repo/conventions.md`, superseding the older note that reassign was "still not implemented on the backend."

### 2. Fixed: Login page froze on "Signing in..." with no error on failed login
Root cause: this is a **zoneless Angular app** (no `zone.js` dependency at all — confirmed via `frontend/package.json`/`angular.json`). `LoginComponent` used plain (non-signal) fields (`errorMessage`, `isLoading`, `showPassword`) — mutating them after an `await` doesn't trigger a view update in zoneless mode, so on a failed login (e.g. wrong Employee ID) the button stayed stuck on "Signing in..." forever with no error shown.
- Fixed in `frontend/src/app/pages/login/login.component.ts` (converted all three to `signal()`) and `frontend/src/app/pages/login/login.component.html` (template calls them as functions).
- Verified live: invalid credentials now correctly show "Invalid credentials. Please try again." and re-enable the button.
- **This is a systemic risk pattern for this codebase** — any component doing `async/await` with plain fields (instead of signals) for UI state will silently fail to re-render after the await resolves. See anti-pattern note below.

### 3. Investigated "fail to create new product" — confirmed backend-only issue
Live-tested `POST /api/v1/products` as an Engineer (`ENG-TST-3`) directly against `http://10.144.15.76:3000` → `403 Forbidden: "Only admin or manager can create products"`. Frontend (`pm-create.component.ts` → `pm.service.ts createProduct()`) is correctly gated by `pm.create.submit` (which Engineers have) and sends the exact same request — this is purely the live backend's role restriction rejecting it.
- User decided: **Engineers should be allowed to create products.**
- This checkout's `backend/src` has **no products controller/resource at all** (confirmed via grep) — the 403 comes from a newer, undeployed-here backend, so no local source fix was possible.
- Requirements documented in new file `docs/backend_products_create_permission.html`: (1) allow `engineer` role on `POST /products`, (2) also fix the pre-existing known gap (`backend.instructions.md` "Known Gaps") where creator ownership rows aren't assigned on product create.

### 4. Fixed: Record PM — checklist and task list both needed independent scroll bounds
Two related fixes in `frontend/src/app/pages/pm-record/pm-record.component.html`:
- **Checklist box** (~line 138): added `max-height:400px; overflow-y:auto` so a 100-item checklist scrolls internally instead of stretching the whole Execute/Approve panel.
- **Left "Available PM Tasks" list** (~line 29): was completely unbounded — with `TECH-TST-1`'s 144 available tasks, the list forced users to scroll past every single task row before the Execute/Approve panel (which renders below it in the single-column layout that kicks in under `pm-record.component.scss`'s `@media (max-width: 1024px)` breakpoint) became reachable. Capped with `max-height:calc(100vh - 220px); overflow-y:auto` so the list is bounded regardless of task count, matching the pattern the right-hand Execute panel already used (`position:sticky` + its own `max-height`/`overflow-y:auto`).
- Verified via `npx tsc --noEmit` (0 errors) and live in-browser (selected a task, list stayed compact, Submit button reachable without paging through 144 rows).

### 5. Recovered an unrelated, unstaged deletion of the entire `backend/` folder
Before committing, `git status` showed the **entire `backend/` directory** (all of `backend/src`, `backend/prisma`, config files, etc.) as locally deleted but never staged/committed — not caused by this session (no delete commands were run). This is likely why an earlier investigation this session found no `products.controller.ts` on disk. Restored via `git checkout -- backend/` before any commit, so the new branch does not accidentally delete the backend in history.

## In-flight / next steps

1. **Hand `docs/backend_products_create_permission.html` to the backend team** — Engineers currently cannot create products at all (403), and the fix requires backend changes (this checkout has no products controller to patch locally).
2. **Bundled in this same commit, not authored this session**: `frontend/src/app/pages/pm-calendar/pm-calendar.component.html`/`.ts` had pre-existing uncommitted changes (a "Next up: <task> — <date>" hint shown in the Today sidebar when nothing is due today, via new `nextUpcomingTask` computed signal). Small (~18 lines), appears complete — found already sitting in the working tree at session start, same situation as the previous session's bundled-changes caveat. Not reviewed/scrutinized this session.
3. No `/code-review` or `/scrutinize` pass was run this session on any of the above — only ad-hoc verification (tsc + live browser checks). Run the repo's standard self-review before merging `frontend-test-feature` anywhere.
4. Double-check whether `frontend-test-feature` was intended as a long-lived branch or a throwaway — branch name suggests the latter; confirm with the user before merging to `main`.

## Known issues / deferred work

- **Engineers cannot create new Products end-to-end** until the backend ships the fix in `docs/backend_products_create_permission.html`. No frontend workaround applied (none needed — frontend is already correct).
- **Zoneless-signal anti-pattern risk**: other components may have the same bug class as the Login page had (plain fields mutated after `await` never re-render). Not audited across the whole app this session — only `LoginComponent` was fixed because it's what broke.
- `backend/` folder deletion in the working tree was recovered this session, but the *cause* is unknown (not investigated — could be an OneDrive sync issue given this workspace lives under a OneDrive-synced path, per existing `/memories/tooling.md` notes about that path causing other tooling issues). Worth keeping an eye on if it recurs.

## Anti-patterns to avoid (NEW this session)

### Zoneless Angular + plain fields = silent no-render after `await`
This app has **no `zone.js`** (confirmed absent from `package.json`/`angular.json`) — it's a zoneless Angular 21 app relying on Signals for change detection, per `.github/instructions/frontend.instructions.md`. Any component that does `async onSubmit() { ...; await something(); this.plainField = x; }` will NOT re-render after the `await` resumes, because the continuation runs in a microtask outside the event dispatch that Angular's zoneless scheduler tracks. **Always use `signal()` for any component field that's mutated inside an `async` method after an `await`**, never a plain class field — this was the exact cause of the Login page freezing on failed login with no error shown.

## TypeScript / build status

`npx tsc --noEmit` (frontend) — 0 errors, last run at the end of this session after the Record PM scroll fixes.
`npm start` — not re-run this session; the dev server was already running throughout (used for live verification via the browser tool).
No backend changes this session — this checkout's backend has no products resource to change; all backend requirements are documented only, in `docs/backend_products_create_permission.html`.

