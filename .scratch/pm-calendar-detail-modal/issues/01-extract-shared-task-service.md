# 01 — Extract shared task-management logic into PmService

**Blocked by:** nothing

**What it delivers:**
Moves `canManageTask`, `canReassign`, `getTaskTechnicians`, `getReassignTechnicians`, and the assign-a-Pending-task logic (including the recurring-series "assign the earliest still-Pending sibling" lookup) out of `pm-assign.component.ts` and into `pm.service.ts` as shared methods. `pm-assign.component.ts` is updated to call the new service methods instead of its own private copies. Pure refactor — no behavior change, no UI change.

New `PmService` methods:
- `canManageTask(task: PMTask): boolean`
- `canReassignTask(task: PMTask): boolean` (renamed from `canReassign` to avoid clashing with the existing `reassignTask` method name)
- `getAssignableTechnicians(task: PMTask): User[]`
- `getReassignableTechnicians(task: PMTask): User[]`
- `assignTaskToTechnician(task: PMTask, techId: string): Promise<void>` — contains the series-lookup + `updateTask()` call currently inlined in `pm-assign.component.ts`'s `assignTask()`. Throws on failure (caller shows the toast), matching the existing `reassignTask()` error-handling convention.

**Acceptance criteria:**
- `pm-assign.component.ts` no longer has its own `canManageTask`, `canReassign`, `getTaskTechnicians`, `getReassignTechnicians` methods or inlined series-lookup-on-assign logic — all delegate to `PmService`.
- All existing call sites in `pm-assign.component.ts` (template bindings included) still compile and behave identically.
- `npx tsc --noEmit` (frontend) passes.
- Existing `pm.service.spec.ts` / `pm-assign` tests (if present) still pass unmodified.
- No visual or behavioral change on the Assign PM page.
