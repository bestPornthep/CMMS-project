# 03 — Add Assign control to the shared modal (Pending tasks)

**Blocked by:** 01, 02

**What it delivers:**
When the modal is open for a task with `status === 'Pending'` and `pmService.canManageTask(task)` is true, show a technician dropdown + **Assign** button below the read-only fields (matching the Assign PM Unassigned-tab row UX). Clicking Assign calls `pmService.assignTaskToTechnician(task, selectedTechId)` immediately (no confirm step, consistent with Assign PM's existing per-row behavior) and shows a success/error toast.

If `canManageTask(task)` is false, no control is shown — read-only fields only (same as today's Done modal).

**Acceptance criteria:**
- Dropdown lists technicians from `pmService.getAssignableTechnicians(task)`.
- Assign button disabled until a technician is selected.
- On success: toast shown, modal's fields reactively reflect the new assignment (task list refetch already happens inside `assignTaskToTechnician`/`updateTask`).
- On failure: error toast shown, modal stays open.
- Control is not shown for any other status, or when `!canManageTask(task)`.
- New button/label strings added to `translation.service.ts` with `| tr` pipes in the same edit.
- `npx tsc --noEmit` passes.
