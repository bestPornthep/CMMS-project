# 05 — Rewire calendar click routing to use the modal

**Blocked by:** 02, 03, 04 (modal must show assignment info + controls before calendar routes non-Done tasks into it)

**What it delivers:**
Updates `goToRecord()` in `pm-calendar.component.ts`:
- **Technician branch:** `Done` → `pmService.viewedTaskGlobal.set(task)` (changed — was pm-record). All other statuses → unchanged (`router.navigate(['/pm-record'], ...)`).
- **Non-technician branch:** `Pending Approval` → unchanged (pm-record Approval tab). `Done` → unchanged (modal). `Pending` / `In Progress` / `Overdue`, when **not** `fromSidebar` → `pmService.viewedTaskGlobal.set(task)` (changed — was `router.navigate(['/pm-assign'], ...)`). When `fromSidebar` is true → unchanged (`highlightTask()`, no modal, no navigation).

**Acceptance criteria:**
- Manager/Admin/Engineer clicking a Pending/In Progress/Overdue chip in the grid opens the modal, no navigation, no page change.
- Same roles clicking a sidebar "Overdue"/"Today" item still only scroll/highlight — no modal, no navigation (unchanged).
- Technician clicking a Done chip opens the modal instead of navigating to pm-record.
- Technician clicking any other status still navigates straight to pm-record (unchanged).
- Existing authorization gate (engineer product/creator restriction, "Visual only, not authorized" early return) still runs before the modal-vs-redirect decision.
- `npx tsc --noEmit` passes.
- Manual check: all six role/status combinations in the spec's behavior table verified against the running app.
