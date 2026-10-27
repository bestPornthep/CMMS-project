# 04 โ€” Machine detail modal

**What to build:** Clicking a machine row opens a centered modal with the machine and its PM types. In this ticket it is read-only: it shows the PM types of in-plan machines and an empty state for the others. Later tickets add drafts and the Send controls.

**Blocked by:** 01 โ€” Plan status foundation, 02 โ€” Preview tasks and plan tasks

**Status:** built

- [ ] Row click opens the modal. Clicks on Edit, Remove PM Type, Deactivate, Reactivate and edit-row inputs do not open it, and a row in edit mode does not open it.
- [ ] The modal shows name, id, customer, department, work center, an Active/Inactive badge and a plan badge (Not in plan / In plan).
- [ ] For an in-plan machine, PM types come from plan tasks grouped by frequency, excluding Cancelled. Each shows frequency, title, recurring or one-off, first/next due date (earliest open task, "โ€”" if none), hours, description, parts and an expandable checklist with photo/value required marks. Fields with no data are omitted.
- [ ] Changes waiting for approval on an in-plan machine appear with a "Waiting for approval" tag: adds as extra entries with their details, removals tagged on the existing entry.
- [ ] A Not-in-plan machine with no PM types shows a friendly empty state that explains the next step.
- [ ] The modal can be opened from a link parameter naming the machine. An unknown id, or a machine hidden from the user by department scoping, shows an error toast and no modal.
- [ ] The modal closes via Close, overlay click and Escape, and closes by itself if the machine disappears while it is open.
- [ ] Accessible: dialog role with a label, focus moves into the modal and returns to the row on close.
- [ ] Thai strings for every new label.
- [ ] Thin UI tests; `npx tsc --noEmit` is clean; checked in the browser.
