# 07 โ€” Backend proposal doc and final verification

**What to build:** Document the backend proposal and run a full verification pass of the feature, including every edge case and error path.

**Blocked by:** 06 โ€” Send, Withdraw, Approve, Reject

**Status:** in progress (doc done; browser walk-through, review pending)

- [ ] The `#masterplan` section of the combined backend doc describes the proposal: a per-machine plan-status field, draft PM types stored server-side, and Send / Withdraw / Approve / Reject semantics. It states that it is a frontend-derived proposal not yet agreed with backend, and that the startup seeding rule is a demo seed.
- [ ] `npx tsc --noEmit` is clean and the production build passes.
- [ ] All new specs pass and the full test result is recorded (existing stale specs are listed, not hidden).
- [ ] Browser walk-through passes: add machine, open detail, create PM from the detail, remove a draft, send, withdraw, send again, reject, fix, send, approve, check the Master Plan row and revision, make a change on the in-plan machine (goes to approval), and the duplicate and error paths.
- [ ] Error-handling sweep: every action that can fail shows a clear message, no unhandled promise rejection, no console errors during the walk-through, no partial state after a failure.
- [ ] No other page shows a preview task or a draft (Assign PM, Record PM, Calendar, Dashboard, Reports, notifications).
- [ ] The handoff file is updated for the next session.
