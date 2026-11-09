# Handoff — Session 2026-11-09: Frontend cleanup (self-hosted fonts, dead SCSS removed, PmService split, angular-eslint guard)

## Branch
`chore/frontend-cleanup`, branched from `feature/pm-checklist-audit-diff` at `a294ebd` (that branch is pushed). Not merged, and **nothing on the cleanup branch is committed yet**. Ask the user before committing or pushing. The untracked files must be included in the commit: `frontend/eslint.config.js`, plus `pm-store.service.ts`, `pm-task.service.ts`, `master-plan.service.ts`, `template.service.ts` and `pm-masterplan-mock.ts` under `frontend/src/app/core/services/`.

## What was done this session

- **angular-eslint, type-aware** (`frontend/eslint.config.js`, `lint` target in `angular.json`, `npm run lint`):
  - Rules that already had violations are set to `warn`; that is the baseline.
  - Clean rules and `no-misused-promises` are `error`.
  - Current result: 0 errors, 796 warnings (35 of them are `no-floating-promises`).
- **Fonts and icons are self-hosted:**
  - Packages: `@fontsource/plus-jakarta-sans` (400–800 plus 400 italic), `@fontsource/jetbrains-mono` (400, 500) and `material-symbols` (outlined). Their CSS is listed in the `angular.json` build `styles`, before `src/styles.scss`.
  - The Google `<link>` tags are gone from `index.html`, and the `@import` is gone from `styles.scss`.
  - Checked in a browser with Google blocked: zero font requests leave the app, and icons render as glyphs.
- **Dead SCSS removed, about 2,500 lines:**
  - Copied app-shell rules (sidebar, nav, topbar, `.app`, `.main` and similar) came out of dashboard, pm-record, pm-calendar, pm-assign, pm-create and pm-approvals. Under emulated encapsulation these could never match.
  - Also removed: `:root{}` blocks inside components, page-level `--sidebar-width`, 57 custom properties nothing reads, and 10 that only repeated the global value.
- **Real CSS bug fixed (a visible change):** declarations of the form `--x: var(--x)` are a CSS cycle, which the browser treats as invalid. Results of the fix:
  - Task IDs on pm-record and pm-assign (`.mono`) now actually use JetBrains Mono.
  - pm-calendar now gets its card shadows and the eased transitions.
  - The code review confirmed these are the only visual changes.
- **`pm.service.ts` (about 1,600 lines) deleted and split, with identical logic** (confirmed method by method in an opus code review):
  - `PmStore` (`pm-store.service.ts`): signals for assets, tasks and preview tasks; `loadData()`, which is the only load entry point (`APP_INITIALIZER` and login); `viewedTaskGlobal`; write methods `updateAssets`, `setPmTasks`, `updatePmTasks`, `updatePreviewTasks`.
  - `TemplateService`: templates and the default mock templates.
  - `PmTaskService`: task actions and permission checks.
  - `MasterPlanService`: machines, drafts, send/withdraw/approve/reject, versions, local audit log (965 lines).
  - Mock seeds moved to `pm-masterplan-mock.ts`. `SERIES_MARKER*` and `copyPmTypeDetail` moved to `pm-plan.util.ts`; `normalizeFrequency` moved to `pm-frequency.util.ts`.
  - Injection runs one way only: `MasterPlanService → PmTaskService → PmStore → TemplateService`.
  - `updatePmSchedule` deleted (it had no callers). `updateAsset` and `removePmScheduleType` are now private.
  - Specs changed only in setup lines and call receivers. The `describe('PmService…')` test names were kept on purpose so the passing-test lists can be compared by name.
- **Agent instructions now record the lessons from this cleanup:**
  - `.github/instructions/frontend.instructions.md`: component SCSS rules, the fonts rule, the services and dependency-direction map, a size limit on services, and lint rules.
  - `.github/copilot-instructions.md`: correct type-check and lint commands, and the Key Files table.
- `dashboard.component.ts`: a stale comment that referred to `pm.service.ts` was fixed.

## In-flight / next steps

1. **Ask the user to commit and push** `chore/frontend-cleanup`, including all the untracked files listed above. After that, ask whether to merge into `feature/pm-checklist-audit-diff` or open a PR.
2. **Signed-in visual check.** It was not done because it needs a manager login on the shared backend, and the session is lost on reload, so click links only. Check every page at desktop and at 768 px. Pay special attention to:
   - pm-calendar shadows and transitions, and the task-ID font on pm-record and pm-assign (both intentional changes);
   - dashboard, pm-record, pm-create and pm-assign layouts, which had the largest SCSS deletions.
3. Items carried over from the previous handoff, still open:
   - A 768 px pass of the Approvals and Manage Machines tables and the topbar.
   - Send-to-Master-Plan browser checks: the approval card for an in-plan machine; the seed card `MOCK-WAVE-SOLDER-1`; no preview tasks on the execution pages; Thai UI.
   - Update the status lines in tickets 06 and 07 (`.scratch/send-to-master-plan/issues/`).
   - Decide with the user whether new-customer creation in Add Machine should wait for beta.
4. Lint follow-up: fix `no-floating-promises` (35 hits) and then promote that rule to `error`. After that, work through the other `warn` rules one at a time.

## Known issues / deferred work

- The pre-existing oddities below were noticed during the split but not fixed, to keep it behavior-preserving:
  - `pm.service.spec.ts` expects `addPmTask`, `updateTask`, `saveTemplate` and `deleteTemplate` to throw synchronously, but they are async.
  - `saveTemplate` changes the template object passed into it.
  - `cancelPmTaskSeries` and `removePmScheduleType` ignore API errors and apply the change locally only.
  - `assignTaskToTechnician` matches `[SeriesID: X]` by exact text and does not use `SERIES_MARKER`.
- `master-plan.service.ts` is still 965 lines. Split it further before adding features to it.
- Shared UI patterns are still styled separately in each page, with small differences between copies: `c-dropdown`, `ms-*`, `modal-overlay`, `data-table`. A safe automatic hoist would only have saved 10 declarations, so the real fix is extracting shared components.
- npm audit went from 44 to 58 issues. All 14 new ones are moderate and come from the dev-only eslint toolchain, via `minimatch`. They don't ship to users.
- The initial bundle is 549 kB against a 500 kB budget (it was 578 kB). This is a warning only.
- 109 of 410 tests fail at baseline: they call the real dev backend `10.144.15.76` and get 401. They are unchanged by this work.
- Carried over: interpolated toasts are not translated; Add Machine with a new customer calls the real backend `createProduct`; Master Plan state is memory-only until the backend exists.

## Anti-patterns to avoid

- **Plain `npx tsc --noEmit` in `frontend/` checks nothing**, because `tsconfig.json` is solution-style. Always run it with `-p tsconfig.app.json` and with `-p tsconfig.spec.json`.
- **`--x: var(--x)` is not harmless:** it is a CSS cycle that turns the variable off for the whole subtree. Never re-declare a global token inside a page just to "alias" it.
- **Don't copy another page's SCSS as a starting point.** That is how about 2,500 dead lines built up. The rules now live in `frontend.instructions.md`.
- Before deleting or hoisting CSS, check dynamic class usage (`[class.x]`, `[ngClass]`, string-built names, `classList`) and the effect on the cascade (specificity changes once the `[_ngcontent]` attribute is gone).
- To prove a refactor preserves behavior, compare **passing test names** and **`expect(` counts per spec** against a saved baseline. Exit code and totals are not enough, because 109 tests fail at baseline. Ready-made scripts are in the session-state folder `files/` (`compare-tests.js`, `expect-count.js`, `lint-check.js`), but they are not in the repo.

## TypeScript / build status

- `npx tsc --noEmit -p tsconfig.app.json`: 0 errors.
- `npx tsc --noEmit -p tsconfig.spec.json`: 0 errors.
- `npm run lint`: 0 errors, 796 warnings (baseline was 797).
- `npx ng test --watch=false`: 301 pass and 109 fail, the same set of passing test names as baseline. `expect(` count is 1,070, the same as baseline.
- `npx ng build`: passes, with only the bundle-budget warning (549.23 kB).
- `npm start` builds clean. No dev server is left running.
