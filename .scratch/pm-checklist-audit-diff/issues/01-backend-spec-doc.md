# Ticket 1 — Backend spec doc: checklist change diff in audit log

Create `docs/backend_pm_checklist_change_audit.html` (follow existing doc pattern, e.g. `docs/backend_pm_series_checklist_edit.html`) covering:

- Where the diff is computed: inside the same `PUT /pm-tasks/schedule/:seriesId` handler that already calls `CmmsService.logAudit()` for this mutation, comparing the schedule's checklist **before** the update to the incoming checklist.
- The exact-text multiset matching algorithm (see spec.md).
- The `changes: string[]` field added to the audit log entry, JSON-string column per existing convention.
- No audit entry at all when the diff is empty (pure reorder / resubmit unchanged).
- Note that this depends on the existing series-checklist-edit endpoint (and its blocked-on-reassign-bug caveat) — link to `backend_pm_schedule_reassign_bug.html` and `backend_pm_series_checklist_edit.html`.

Verify: doc reads clearly standalone, matches the HTML style (`.card`, `.warn-box`, tables) of existing backend docs.
