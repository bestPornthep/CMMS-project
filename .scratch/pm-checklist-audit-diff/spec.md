# Spec — Checklist Change Audit Trail

## Problem
When a manager/engineer edits a recurring series' checklist (`PmService.updateSeriesChecklist()` → `PUT /pm-tasks/schedule/:seriesId`), the audit log records **who** made the change but not **what** changed. Need to trace the actual diff.

## Scope
Series checklist edits only (the existing "Edit Recurring Series Checklist" feature, [docs/backend_pm_series_checklist_edit.html](../../docs/backend_pm_series_checklist_edit.html)). Execution-time changes (technician checking off items, entering values, attaching photos during PM Record) are out of scope.

## Diff algorithm (backend)
Checklist items have no stable ID — only `text`, `requiresPhoto`, `requiresValue`. Match old → new by **exact text**, treating the checklist as a bag of items (order doesn't matter):

1. Build a multiset of old item texts and new item texts.
2. Text present in new but not old (accounting for duplicate counts) → **added**.
3. Text present in old but not new → **removed**.
4. Text present in both → compare `requiresPhoto`/`requiresValue` per matched item:
   - flag turned on → "added photo/value requirement" entry
   - flag turned off → "removed photo/value requirement" entry
5. Pure reorder (same multiset, no flag changes) → diff is empty.

**If the diff is empty, no audit log entry is created at all** — an edit that changes nothing is not logged.

## Audit log entry shape
Add one field to the existing audit log entry (the `logAudit()` call already made for this mutation):

```ts
changes: string[] // human-readable lines, e.g.:
// "Added: 'Inspect belt tension'"
// "Removed: 'Check pressure valve'"
// "Added photo requirement: 'Check filters'"
// "Removed value requirement: 'Measure gap'"
```

Stored as a JSON string column (matches existing `checklist`/`parts`/`permissions` convention — see [backend.instructions.md](../../.github/instructions/backend.instructions.md)). Parsed to `string[]` on read, same as other JSON columns.

## Frontend display
`AuditLog` model gets an optional `changes?: string[]`. Audit Log page: each row whose entry has `changes` gets a small expand toggle; expanded state shows each change line as a colored tag (green for added, red for removed, blue for photo/value requirement changes). Rows without `changes` render exactly as today — no toggle.

## Out of scope / explicitly deferred
- No stable per-item ID introduced (would change checklist data model broadly — bigger change than this feature warrants).
- No UI for browsing diff history outside the Audit Log page.
- No backend code changes are runnable in this repo (backend/ is doc-only here) — backend requirements go into a new `docs/backend_*.html` spec doc, same pattern as existing ones.
