# Spec — PM Calendar: Detail Modal Instead of Redirect

## Problem Statement

Clicking a PM task chip on the Calendar page redirects the user away to the Assign PM page (for Pending/In Progress/Overdue tasks) just to let them glance at who it's assigned to. Users don't want to leave the calendar for a quick look. Separately, technicians clicking a **Done** task are inconsistently sent to Record PM instead of seeing the same read-only modal every other role already gets.

## Solution

Replace the calendar's redirect-to-Assign-PM behavior with the existing shared "PM Details" modal (`pmService.viewedTaskGlobal`, rendered in `layout.component.html`), extended with assignment info and inline Assign/Reassign controls. Fix the technician Done-task inconsistency along the way.

## Final Click Behavior

| Role | Status | Behavior |
|---|---|---|
| Technician | Done | **Changed** → shared modal (read-only) |
| Technician | Pending / In Progress / Overdue / Pending Approval | Unchanged → pm-record (execute) |
| Manager/Admin/Engineer | Done | Unchanged → shared modal (read-only, as today) |
| Manager/Admin/Engineer | Pending Approval | Unchanged → pm-record (Approval tab) |
| Manager/Admin/Engineer | Pending / In Progress / Overdue | **Changed** → shared modal, with Assign/Reassign controls |
| Any role | Sidebar "Overdue"/"Today" list click | Unchanged → scroll/highlight grid cell only, no modal |

Existing calendar authorization gate in `goToRecord()` (engineer product/creator restriction) is unchanged — it still runs before deciding modal vs redirect.

## Modal Content (shared component, all statuses)

Always shown (new fields, in addition to existing Asset/Product/Status/Est./Act. time):
- **Created By** (`task.createdBy`, via `getCreatorName`-style lookup)
- **Created At** (`task.createdAt`)
- **Assigned To** (`task.assignedTo` name, or "Unassigned")
- **Assigned At** (`task.assignedAt`, if present)
- **Reassign count badge** (`task.reassignCount`, if > 0) — same badge already used on Assign PM's Assigned tab

Interactive controls, gated by `canManageTask(task)`:
- `status === 'Pending'` → technician dropdown + **Assign** button (immediate, no confirm step — matches Assign PM's existing per-row UX)
- `status === 'In Progress' || status === 'Overdue'` → technician dropdown + **Reassign** button, with an inline confirm step before submitting (no stacked second modal — expand a confirm line in place, matches the intent of Assign PM's confirm modal without duplicating a second overlay)
- If `!canManageTask(task)` → read-only fields only, no controls (same as Done today)

Reassign is wired now even though its backend endpoint doesn't exist yet (per last session) — it will 404 until that backend ships, same as it already does on the Assign PM page today. Not a blocker for this feature.

## Implementation Decisions

### Shared logic moves into `PmService`
`canManageTask`, `canReassign`, `getTaskTechnicians`, `getReassignTechnicians`, and the assign-a-pending-task logic (including the recurring-series "assign the earliest still-Pending sibling" lookup currently inlined in `pm-assign.component.ts`'s `assignTask()`) move from `pm-assign.component.ts` into `pm.service.ts` as shared methods. `pm-assign.component.ts` becomes a thin caller of the same service methods — no behavior change there. `reassignTask` already lives in `PmService`; no change needed to it.

This is necessary (not over-engineering) because the same permission/business logic must now be invoked from a second call site (`layout.component.ts`), and duplicating the series-lookup logic would create drift risk between the two.

### `layout.component.ts` / `layout.component.html`
Add the new read-only fields and the two interactive control blocks to the existing `viewedTask` modal markup. New component state: selected technician per open modal, reassign-confirm-pending flag. On success, refetch happens automatically (existing `PmService` methods already refetch `pmTasks()` internally), and the modal's `viewedTask` re-reads from the updated signal reactively — no manual patch needed, matching the existing `getTechName`-style reactive pattern already in this file.

### `pm-calendar.component.ts`
In `goToRecord()`:
- Technician branch: `Done` → `pmService.viewedTaskGlobal.set(task)`; all other statuses → unchanged (`router.navigate(['/pm-record'], ...)`).
- Non-technician branch: `Pending Approval` → unchanged (pm-record); `Done` → unchanged (modal); everything else (`Pending`/`In Progress`/`Overdue`) → when **not** `fromSidebar`, open the modal (`pmService.viewedTaskGlobal.set(task)`) instead of `router.navigate(['/pm-assign'], ...)`. When `fromSidebar` is true, keep calling `highlightTask()` (unchanged — sidebar never navigates or opens the modal).

### Translations
Any new UI copy (e.g. "Created By", "Assigned At", "Reassign", confirm text) needs a `| tr` pipe **and** a `translation.service.ts` dictionary entry added in the same edit — per the anti-pattern already flagged from the previous reassign-feature session. Check `translation.service.ts` for an existing key (several of these — "Reassign...", "Confirm", "Select Tech..." — likely already exist from the Assign PM reassign work) before adding a duplicate.

## Testing Decisions

- `PmService.canManageTask`/`canReassign`/`getTaskTechnicians`/`getReassignTechnicians`/assign-logic are pure functions of `pmTasks()`/`authService` — testable in isolation in `pm.service.spec.ts`, same pattern as existing `viewedTaskGlobal` tests.
- `pm-assign.component.spec.ts` (if it exists) should still pass unchanged after the refactor — it's a pure relocation, not a behavior change.
- Manual verification: click a Pending/In Progress/Overdue chip as manager/engineer/admin → modal opens, no navigation; click Done as technician → modal opens instead of pm-record; click Pending Approval as any non-technician → still navigates to pm-record.

## Out of Scope

- Building the Reassign backend endpoint (separate, already-documented feature from last session — `docs/backend_pm_reassign_api.html`).
- Changing sidebar ("Overdue"/"Today's Schedule") click behavior.
- Changing the global header search modal-vs-redirect logic in `layout.component.ts`'s own search handler (separate code path from the calendar's `goToRecord()`, not touched by this feature).
- Bulk assign/reassign from the modal (single-task only, matching the mockup).

## Further Notes

- Reference mockup: `docs/pm_calendar_detail_modal_mockup.html` (confirmed with user).
- `docs/pm_task_lifecycle_diagram.html` documents the current click-routing logic and will need a follow-up update once this ships (not part of these tickets — flag for a later docs pass).
