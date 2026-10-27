# Spec — Machine detail + "Send to Master Plan"

Supersedes the previous "Add Machine → approval card" behaviour (see `.scratch/add-machine/spec.md` for the original page).
`CONTEXT.md` does not exist in the repo, so the glossary below is the source for the new terms.

## Problem Statement

Today every change to a machine on Manage Machines (add, edit, deactivate, remove a PM type) and every PM created on Create PM
waits for a manager's approval, even while the machine is still being set up. Users cannot open a machine to see which PM types
it has, and they have no way to say "this machine is ready for the Master Plan". A new machine cannot even be used on Create PM
until it is approved, because it only exists inside the approval card.

## Solution

Each machine is either **Not in plan** or **In plan**.

- While a machine is **Not in plan**, everything about it is changed at once, with no approval. Its PM types are drafts.
- Clicking a machine row opens a **detail window** that lists its PM types. A **Send to Master Plan** button there asks a manager to
  approve the machine, together with all its PM types, into the plan.
- Once the manager approves, the machine is **In plan**, the Master Plan gets a new revision, and every later change to the machine
  waits for approval, exactly as today.

## Glossary

| Term | Meaning |
|---|---|
| **In plan** | The machine is part of the approved PM Master Plan. It shows on the Master Plan page. Every change needs approval. |
| **Not in plan** | The machine has not been approved into the plan. Hidden from the Master Plan page. Changes apply at once. |
| **Waiting for approval** | A Send request for the machine is open. Not a stored state; derived from the open request. The machine is locked. |
| **Draft PM type** | A PM type defined on a not-in-plan machine (same fields as Create PM). In memory only. Creates no tasks. |
| **Send to Master Plan** | The action that creates one approval request for a not-in-plan machine and all its draft PM types. |
| **Preview task** | An in-memory PM task created when a Send is approved, only so the Master Plan grid has marks to draw. Never sent to the backend. |

```
Not in plan --Send--> Waiting for approval --approve--> In plan
                            |--reject-----> Not in plan (reason shown)
                            |--withdraw---> Not in plan
```

## User Stories

### Machine detail
1. As an engineer, I want to click a machine row and see its details, so that I can review it without leaving Manage Machines.
2. As an engineer, I want the detail to list every PM type of the machine, so that I know what the machine's plan covers.
3. As an engineer, I want each PM type to show frequency, title, recurring or one-off, first/next due date, estimated hours, description, parts and checklist, so that I can judge whether it is complete.
4. As an engineer, I want the detail to show whether the machine is Not in plan, Waiting for approval or In plan, so that I know what I can do next.
5. As an engineer, I want Edit, Remove PM Type and Deactivate in a row to keep working without opening the detail, so that existing habits are not broken.
6. As an engineer, I want to filter the machine list by plan status, so that I can quickly find machines that are not in plan yet.

### Preparing a machine (Not in plan)
7. As an engineer, I want a newly added machine to be created at once as Not in plan, so that I can prepare it before a manager sees it.
8. As an engineer, I want to edit, deactivate and reactivate a not-in-plan machine without approval, so that preparing it is quick.
9. As an engineer, I want PM types I create for a not-in-plan machine saved as drafts without approval, so that I can set up the whole machine first.
10. As an engineer, I want drafts labelled "Draft", so that I can tell them from live PM types.
11. As an engineer, I want to remove a draft PM type without approval, so that I can correct mistakes.
12. As an engineer, I want a "+ Add PM type" button in the detail that opens Create PM with the machine already selected, so that I do not pick it again.
13. As an engineer, I want to return to the machine detail after saving a draft, so that I can see the result and send it.
14. As a technician, I want unapproved PM types to stay out of Assign PM, Calendar and Dashboard, so that I never see work that is not planned yet.

### Sending to the Master Plan
15. As an engineer, I want a Send to Master Plan button in the detail, so that I decide when a machine is ready.
16. As an engineer, I want the button disabled, with a hint, while the machine has no PM types, so that I cannot send an empty machine.
17. As an engineer, I want the button disabled, with a hint to reactivate, for an inactive machine, so that retired machines are not sent.
18. As an engineer, I want a Send to create one approval request with the machine and all its PM types, so that the manager reviews everything at once.
19. As an engineer, I want the machine locked while the request waits, so that what the manager reviews cannot change underneath them.
20. As an engineer, I want to withdraw my request, so that I can fix something after sending.
21. As an engineer, I want to see why a request was rejected, so that I can fix it and send again.
22. As an engineer, I want a rejected or withdrawn machine to return to Not in plan, so that I can keep preparing it.

### Approving
23. As a manager, I want Send requests in Master Plan Approvals tagged "Add to Master Plan", so that I can tell them from change requests.
24. As a manager, I want the request to show every PM type with its full details, so that I can approve with confidence.
25. As a manager, I want approval to put the machine in the plan and create a new revision, so that the Master Plan keeps its history.
26. As a manager, I want bulk approval of several Send requests to produce one revision, as today.
27. As a manager, I want rejecting to require a reason, as today, so that the engineer knows what to fix.
28. As an auditor, I want approved and rejected sends in the Audit Log, so that plan changes are traceable.

### Machines in plan
29. As an engineer, I want every change to an in-plan machine to keep needing approval, so that the approved plan stays controlled.
30. As an engineer, I want the detail of an in-plan machine to mark PM types that have a change waiting, so that I know what is pending.
31. As an engineer, I want Create PM on an in-plan machine to keep going through approval, as today.

### Master Plan page
32. As a manager, I want the Master Plan to list only in-plan machines, so that it shows the approved plan and nothing else.
33. As a manager, I want a newly approved machine to show marks for each occurrence through year-end, so that its row looks like a real plan.
34. As a manager, I want older revisions not to list machines that were not yet in the plan then, so that history is accurate.

### Existing data and safety
35. As a manager, I want machines that already have PM types to start In plan, so that today's Master Plan does not change.
36. As a manager, I want machines with no PM types to start Not in plan, so that they go through the new flow.
37. As an engineer, I want my machines, drafts and requests to survive logging out and in again in the same browser session, so that a manager can approve what I sent.
38. As a developer, I want nothing from this flow written to the backend, so that the shared dev backend stays clean.

## Implementation Decisions

**State and storage**
- Plan status is stored per machine as a frontend-only boolean (`isInMasterPlan`). Absent means In plan (legacy-safe, keeps today's Master Plan unchanged). Waiting for approval is derived from the open Send request, never stored.
- Seeding at data load: a machine with at least one task of any status in the startup load is In plan; a machine with none is Not in plan. This is a demo seed only; the backend field replaces it at beta.
- Machines created in this session carry a frontend-only marker (`isLocalOnly`). They are never sent to the backend and never trigger real PM creation.
- Everything introduced here is in memory only (plan status, local machines, drafts, requests, preview tasks). A page reload clears it.
- Data (re)load, which also runs after every login, must preserve local machines, plan status, drafts, requests and preview tasks, so a user switch in one session does not lose a Send. It must not preserve anything across a page reload.

**Routing rule (single predicate in the PM service)**
- Machine Not in plan and not waiting: change applies directly (in memory).
- Machine In plan: change becomes an approval request, as today.
- Machine waiting for approval: change is blocked with a clear message. UI disables the actions; the service also refuses.

**Draft PM types**
- Stored per machine and frequency, reusing the existing "new PM type detail" shape (title, description, hours, parts, checklist, first due date, recurring flag).
- One PM type per machine and frequency across drafts, real tasks and preview tasks, with the existing frequency normalisation (a custom "1 month(s)" equals Monthly).
- Created by Create PM, removed by the Remove PM Type action, both without approval. Editing a draft in place is out of scope (remove and re-create).

**Send / Withdraw / Approve / Reject**
- Send creates one open request for the machine (the existing one-open-request-per-machine rule). It carries the intent "add to plan" plus a snapshot of the drafts. The machine is locked, so the snapshot cannot drift.
- Withdraw (sender or any approver) deletes the open request. No audit entry.
- Approve: reconcile against live state, then set the machine In plan, turn each draft into preview tasks, clear its drafts, create a new revision, and write the existing "Approved PM Master Plan" audit entry with lines such as "Added machine to Master Plan" and "Added Monthly PM". One approval batch is still one revision.
- Reject: requires a reason (as today). The machine stays Not in plan and unlocked. The detail shows the reason of the latest rejected request until a newer request exists.
- The "request carries a machine that does not exist yet" shape is no longer produced (Add Machine creates the machine at once). Remove it, along with its create-machine diff and its Approvals section.
- The reconcile function gains the send-to-plan intent: the diff reports "set in plan" only when requested and not already in plan.
- Approving add-PM-type requests for a local-only machine creates preview tasks and never calls the backend. The real-creation path stays for backend machines already in plan.

**Preview tasks**
- Kept in their own in-memory store, separate from real tasks.
- One per occurrence: first due date + N × frequency (same frequency parsing as the Master Plan grid, including custom durations), through 31 Dec of the first due date's year, at least one. Daily and hourly types get one task (the grid marks every week from the first). A one-off type gets one task.
- Two accessors: real tasks (unchanged; used by Assign PM, Record PM, Calendar, Dashboard, Reports, notifications) and plan tasks (real + preview; used only by the Master Plan page and the machine detail).
- Plan logic (active PM types, duplicate check, remove PM type) considers both kinds.

**Manage Machines page**
- Row click opens a centered modal in the Approvals-modal style. Row buttons do not open it.
- Modal: machine info; Active/Inactive and plan badges; banners for "Waiting for approval" (with Withdraw) and "Rejected" (with reason); PM type list (frequency, title, recurring, first/next due date, hours, description, parts, expandable checklist); "Draft" and "Waiting for approval" tags; footer with `+ Add PM type`, Send to Master Plan, Close.
- Send is disabled when the machine has no PM types, is inactive, or is already waiting. Hints explain why.
- In-plan machines list PM types from plan tasks, plus ghost entries for waiting adds and removals.
- Table: plan badge next to Status (existing amber "Pending approval" badge stays for waiting requests); plan filter next to All / Active / Inactive.
- Add Machine creates the machine at once; toast says it is Not in plan and how to continue. Edit, Deactivate, Reactivate and Remove PM Type follow the routing rule.
- The page can open a given machine's detail from a link parameter, used when returning from Create PM.

**Create PM page**
- Accepts a machine parameter that preselects customer, department and machine.
- Follows the routing rule: Not in plan saves a draft and returns to that machine's detail; In plan submits for approval as today; waiting is blocked.
- Duplicate check includes drafts and preview tasks.

**Master Plan page**
- Lists only in-plan machines; marks come from plan tasks.
- Revision snapshots keep each machine's plan status, so older revisions do not list machines that were not yet in plan.

**Approvals page**
- Send requests get an "Add to Master Plan" tag and a banner in the modal; PM types appear in the existing "PM Type Changes — Added" section with full details.

**Other**
- Roles: engineer, manager and admin can Send (the existing "propose" rule). Withdraw is allowed for the sender or anyone with the approve permission. Approve and reject need the existing approve permission. Self-approval stays allowed, as today.
- Dev seed cards are updated so they only target in-plan machines; the old "add machine" sample becomes a Send request for a seeded not-in-plan machine.
- Thai translations are added for all new labels.
- The `#masterplan` section of the combined backend doc gets the proposal: a per-machine plan-status field, draft PM types stored server-side, and Send / Withdraw / Approve semantics. It is a frontend-derived proposal, not agreed with backend.

## Testing Decisions

- **Good test:** drives behaviour through public methods or the rendered UI and asserts outcomes (who sees what, what state results), never internal signals or call order.
- **Main seam (highest):** the PM service public API. Cases: startup seeding; adding a machine; direct changes on a not-in-plan machine versus approval requests on an in-plan machine; draft add, duplicate block and remove; Send creates one request and locks the machine; blocked changes while waiting; Withdraw; Approve (in plan, preview tasks per occurrence, drafts cleared, one revision per batch, audit lines); Reject keeps the machine unlocked with the reason; plan tasks versus real tasks; local state surviving a data reload. Prior art: the existing PM service spec (TestBed, log in as a role).
- **Existing seam, extended:** the pure reconcile function, with send-to-plan cases. Prior art: its existing spec.
- **Thin UI seam:** Manage Machines (row click opens the detail; Send disabled states) and Create PM submit branching. Prior art: the Create PM component spec. Its current submit test still asserts the old direct-create behaviour, so it appears stale (unverified, tests cannot run here) and gets updated.
- **Environment:** the test runner does not work in this sandbox (Vitest worker timeout). Specs are written and type-checked here, behaviour is verified in the browser, and `npm test` is run on the user's machine.

## Out of Scope

- Backend integration and persistence across reload (localStorage too). Planned for the beta release.
- Sending several machines at once from the table.
- Taking an in-plan machine out of the plan (Deactivate remains the way to retire one).
- Editing a draft PM type in place.
- Approver notifications and escalation.
- Hiding cancelled PM types on the Master Plan grid (separate known issue).
- Separation of duties on approval.
- Changing how real backend PM tasks are generated.

## Further Notes

- Git: the user chose to stay on `feature/pm-checklist-audit-diff` with no new branch. The tree is still uncommitted from the previous session; do not commit unless asked.
- Known limitation of the seed rule: completed tasks load later than startup, so a machine whose only tasks are completed starts as Not in plan.
- Pre-existing, not fixed here: approved mock edits to backend machines are lost on re-login because data reload replaces them.
- The initial bundle is already over its 500 kB budget (warning only).
