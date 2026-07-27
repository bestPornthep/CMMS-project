# Handoff — Session 2026-07-27: Workload Fix + Assign PM Bugfixes

## Branch
`feature/pm-form-export` (local) / `origin/feature/update_feature_frontend` (remote)
`feature/workload-fix` — **merged into `feature/update_feature_frontend`** this session

## What was done this session

### Workload calculation fix (`pm-assign.component.ts`)
- Extracted `MAX_PM_HOURS_PER_MONTH = 70` named constant (replaces magic number)
- Added public `getWindowDays(frequency)` helper — frequency-adaptive window: Daily→1d, Weekly→7d, Monthly/Quarterly/Yearly/custom-long→30d, custom day(s)→min(N,30)
- `getTechWorkload(techId, windowDays)` — window now comes from the **task being assigned**, not existing tasks. Called from template with `getWindowDays(task.frequency)`
- Fixed NaN%: Prisma `Decimal` fields serialize as strings over JSON; wrapped with `Number()` in reduce
- Null guard added: `if (!frequency) return 30`
- Bulk assign dropdown keeps default 30-day window (no specific task context)

### Assign page UX fixes (`pm-assign.component.ts`, `.html`)
- `assignTask` made `async` — now awaits backend, shows success/error toast, clears selected tech on success
- Series no-op: if no pending task in series, shows warning toast instead of false success
- `confirmBulkAssign`: 3-state toast (full success / partial / all failed)
- `toggleTechDropdown()` added — only one tech dropdown open at a time (was ทับกัน)

### Tech task visibility fix (`pm-record.component.ts`, `.html`)
- Removed 14-day date filter from `availableTasks` — techs now **see** all assigned tasks
- Added `isTooEarly(task)`: returns true if `nextDueDate > today + 14 days`
- Submit button disabled + notice shown when `isTooEarly` — techs can plan but not execute early
- Removed dead `const now` / `const lookahead` variables

## Current state
- `feature/update_feature_frontend` on GitHub is up to date with all fixes
- `feature/pm-form-export` local branch = same as remote (merged)
- Backend was intermittently down this session (MSSQL connection drops) — tasks not visible to techs when backend is down

## Known issues / deferred work
- `PUT /templates/:id` backend endpoint missing
- `POST /products` does not assign creator ownership rows
- Default templates mock-injected in `pm.service.ts` — not from backend
- `[SeriesID: xxx]` in task descriptions is legacy; `pm-schedules` migration incomplete
- `Asset` model has no `machineNo` field — `asset.id` used as placeholder in PM form export
- Backend server (NestJS + MSSQL) needs to be started manually each session

## Anti-patterns to avoid

### Angular template cannot access `private` class members
Any property/method referenced in an Angular template must be public. Use `readonly` for constants.

### Orphaned code from incomplete refactoring
A `return role === ...` fragment + missing `}` caused the entire bottom half of a class to be parsed as method-local. When extracting a getter, verify the origin site is completely clean. Run `npm start`, not just `tsc --noEmit`.

### tsc --noEmit does NOT catch Angular template binding errors
Always run `npm start` after finishing implementation.

### Prisma Decimal serializes as string over JSON
`estimatedHours` is `Decimal` in schema → comes back as `"5.00"` string. Always wrap in `Number()` before arithmetic. Check any other `Decimal` fields used in math.

## Build status
`npx tsc --noEmit` — 0 errors (last verified this session)
- `isApprover` referenced in template and `getDisplayChecklist()` but never defined as a class property

Fix: added missing `}`, removed orphaned return, added `get isApprover(): boolean` getter.

### 4. Feature � PM Form Export (Kimball FM-MF-02 check sheet)
Full implementation in `frontend/src/app/pages/pm-reports/`. Spec: `.scratch/pm-form-export/spec.md`.

**Data layer** (`pm-reports.component.ts`)
- `exportFormData` computed produces 2 pages per asset: Jan�Jun (page 1), Jul�Dec (page 2)
- Each page: assetId, assetName, year, halfLabel, months[], checklistRows[], wwByMonth, dateByMonth
- Checklist rows = union of all task.checklist[] items for that asset in the selected year
- ? when item.done === true, blank otherwise; WW = week-of-month; Date = `DD Mon`

**HTML template** (`pm-reports.component.html`)
- 9-column table with `<colgroup>` for fixed widths
- Header: Kimball logo | Title | Year
- Rows: Machine Name, Machine No., WW, Date, checklist items, Signature (blank), Approved (blank)
- Remark / Spare parts / Legend � blank
- Footer: `Ref.Doc.P-EN-7.5-01 | QSD: 10000040841 | DC: 374750 | FM-MF-02 | Effective Date: 27/Sep/2021 Rev.L`

**Print CSS** (`pm-reports.component.scss`)
- kpm-* classes, `@page { size: A4 landscape; margin: 8mm; }`, `page-break-after: always` per page

## In-flight / next steps

1. **User review** � open PM Reports  Export Machine PM Form  pick a machine with Done tasks  Generate PDF  verify visually against FM-MF-02 template
2. **Merge** � once approved, merge to main and update this handoff
3. **Asset model extension** (future) � add `machineNo` field to `Asset` model + `cmms_assets` table; update form to read from it. Currently uses `asset.id` as placeholder.

## Known issues / deferred work

- `PUT /templates/:id` backend endpoint missing � required by frontend
- `POST /products` does not assign creator ownership rows
- Default templates mock-injected in `pm.service.ts` � not from backend
- `[SeriesID: xxx]` in task descriptions is legacy; `pm-schedules` migration incomplete
- `Asset` model has no `machineNo` field � `asset.id` used as placeholder in PM form export

## Anti-patterns to avoid (NEW this session)

### Angular template cannot access `private` class members
`private readonly MONTH_NAMES` � tsc --noEmit passes, but `npm start` fails with TS2341.
Rule: Any property referenced in an Angular template must be public. Use `readonly` for constants.

### Orphaned code from incomplete refactoring causes silent structural breakage
A `return role === ...` fragment left inside a method + a missing `}` caused the entire bottom half of the class to be parsed as method-local � class properties became invisible to the template.
Rule: When extracting a getter, verify the origin site is completely clean. Run `npm start`, not just `tsc --noEmit`.

### tsc --noEmit does NOT catch Angular template binding errors
Always run `npm start` after finishing implementation to catch Angular compiler errors that tsc misses.

## TypeScript / build status

`npx tsc --noEmit` � 0 errors
`npm start` � builds clean
