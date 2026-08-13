# 04 — Add Reassign control to the shared modal (In Progress/Overdue tasks)

**Blocked by:** 01, 02

**What it delivers:**
When the modal is open for a task with `status` of `In Progress` or `Overdue` and `pmService.canReassignTask(task)` is true, show a technician dropdown + **Reassign** button below the read-only fields. Clicking Reassign expands an inline confirm line ("You are reassigning X from A to B" + Confirm/Cancel) in place — no second stacked modal. Confirming calls `pmService.reassignTask(task, selectedTechId)`.

This control is wired now even though the reassign backend endpoint doesn't exist yet (per `docs/backend_pm_reassign_api.html`) — it will 404 until that ships, same as the existing Reassign control on the Assign PM page today. Not a blocker for this ticket.

**Acceptance criteria:**
- Dropdown lists technicians from `pmService.getReassignableTechnicians(task)` (excludes the currently assigned tech).
- Reassign button opens the inline confirm state; Cancel collapses it back without submitting.
- Confirm calls `pmService.reassignTask()`; success/error toast shown same as Assign PM's existing reassign flow.
- Control is not shown for any other status, or when `!canReassignTask(task)`.
- New strings reuse existing translation keys (`Reassign...`, `Reassign`, `Confirm`, `Confirm Reassignment`, `You are reassigning`, `from`, `to`, `Select Tech...`) — do not duplicate; add only what's missing.
- `npx tsc --noEmit` passes.
