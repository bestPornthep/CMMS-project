# 02 — Add read-only assignment fields to the shared PM Details modal

**Blocked by:** nothing (independent of 01 — pure display fields, no permission logic yet)

**What it delivers:**
Extends the existing shared "PM Details" modal (`viewedTask` in `layout.component.ts`/`.html`) with new read-only fields, shown for every status (not just Done):
- **Created By** — via existing `getTechName`-style lookup on `task.createdBy` (fallback "System")
- **Created At** — `task.createdAt`, formatted like the existing `Time Stamp` column on Assign PM (`date:'MMM d, y, h:mm a'`)
- **Assigned To** — `task.assignedTo` name, or "Unassigned" if not set
- **Assigned At** — `task.assignedAt`, only shown if present
- **Reassign count badge** — `task.reassignCount`, only shown if > 0, same badge style as Assign PM's Assigned tab

**Acceptance criteria:**
- Opening the modal for any status (Pending, In Progress, Overdue, Pending Approval, Done) shows the new fields.
- "Assigned At" and the reassign badge are hidden when not applicable (unassigned task / reassignCount is 0 or undefined).
- New strings ("Created At", "Assigned At") added to `translation.service.ts` with `| tr` pipes on the labels. ("Created By", "Assigned To", "Reassign" already exist — reuse, don't duplicate.)
- No change to existing modal sections (description, checklist, notes history).
- `npx tsc --noEmit` passes.
