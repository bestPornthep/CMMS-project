# 06 โ€” Send, Withdraw, Approve, Reject

**What to build:** The whole Send to Master Plan flow, end to end: send a Not-in-plan machine with its drafts, lock it while it waits, withdraw, approve (machine joins the plan with preview tasks and a new revision) or reject (machine returns with the reason shown). The Approvals page, dev seeds and the old "request carries a machine that does not exist yet" shape are updated to match.

**Blocked by:** 02 โ€” Preview tasks and plan tasks, 05 โ€” Draft PM types

**Status:** built (browser check of 06 UI pending)

- [ ] The Send button in the detail is enabled only for a Not-in-plan, active machine that is not already waiting and has at least one draft. Otherwise it is disabled with the reason (no PM types, inactive, already waiting, already in plan).
- [ ] Send creates exactly one open request (machine + snapshot of its drafts). A double click or a second Send while waiting is refused. A user without the propose permission is refused.
- [ ] While waiting, Edit, Deactivate, Reactivate, Remove PM Type and adding a draft are refused by the service and disabled in the UI with a hint. The detail shows a "Waiting for approval" banner with Withdraw.
- [ ] Withdraw works for the sender or anyone with the approve permission; others and the case of no open request are refused. After Withdraw the machine is unlocked, its drafts are intact and no audit entry is written.
- [ ] The Approvals page lists the request with an "Add to Master Plan" tag. Its modal shows a banner and the drafts in the "Added" section. Bulk approving several requests makes one revision. Rejecting still needs a reason.
- [ ] Approve sets the machine In plan, creates preview tasks per occurrence from the request's snapshot, clears the drafts, shows the machine on the Master Plan with marks, creates a new revision and writes the audit entry ("Added machine to Master Plan", "Added <frequency> PM").
- [ ] Approve edge cases: an already resolved request is refused; a machine that no longer exists gives a failed result and the request stays pending; a machine already in plan resolves with no revision and no audit entry; the approver may be the sender.
- [ ] Reject requires a reason; the machine stays Not in plan and unlocked with its drafts intact. The detail shows who rejected it, when and why until a newer request exists, and Send is enabled again.
- [ ] An in-plan add-PM-type approval for a local-only machine creates preview tasks and never calls the backend; for backend machines the existing real path is unchanged.
- [ ] The old "request carries a machine that does not exist yet" shape is removed from the model, the reconcile function, the service, the Approvals modal and the dev seeds. Seeds only target in-plan machines and include a Send request for a seeded Not-in-plan machine.
- [ ] The reconcile function reports "set in plan" only when requested and not already in plan; all existing cases still pass.
- [ ] Every failure shows a toast with the real message and leaves no partial state.
- [ ] Thai strings for every new label.
- [ ] Service tests, reconcile tests and a detail/Send UI test; `npx tsc --noEmit` is clean; checked in the browser.
