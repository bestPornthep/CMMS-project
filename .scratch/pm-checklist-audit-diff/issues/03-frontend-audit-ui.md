# Ticket 3 — Frontend: expandable diff row on Audit Log page

- `pm-audit.component.ts`: track which row(s) are expanded (e.g. `expandedLogId` signal); toggle on row click when `log.changes?.length`.
- `pm-audit.component.html`: add an expand affordance (chevron icon) only when `log.changes` is non-empty; expanded row renders each change line as a colored tag — green for "Added:", red for "Removed:", blue for photo/value requirement lines.
- No change to rows without `changes` (render exactly as today).

Verify: `npx tsc --noEmit` clean; manually sanity-check rendering with the mock data from Ticket 2.
