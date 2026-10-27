# 05 โ€” Draft PM types

**What to build:** On a Not-in-plan machine, PM types are drafts. Create PM saves a draft at once (no approval, no tasks), accepts a machine in the link and returns to that machine's detail. Remove PM Type removes drafts at once. The detail lists drafts with a Draft tag and has a "+ Add PM type" button.

**Blocked by:** 03 โ€” Direct changes while Not in plan, 04 โ€” Machine detail modal

**Status:** built

- [ ] The service can add a draft, list a machine's drafts and remove a draft. Drafts live in memory only and survive the reload at login.
- [ ] One PM type per machine and frequency across drafts, real tasks and preview tasks, with the existing alias rules (a custom "1 month(s)" equals Monthly; case and whitespace ignored). Create PM shows its existing duplicate message for drafts too.
- [ ] Clear refusals: machine not found; machine In plan (it must use approval); inactive machine; unauthorized user; blank frequency; hours that are zero, negative or NaN; removing a draft that does not exist.
- [ ] Create PM preselects customer, department and machine from the link parameter. An unknown or inaccessible id is ignored with a toast and the form stays empty.
- [ ] Create PM by machine state: Not in plan saves a draft, shows a toast and returns to Manage Machines with that machine's detail open; In plan submits for approval as today. Existing form validations stay.
- [ ] Create PM's machine picker offers Not-in-plan machines.
- [ ] A double click on submit creates one draft only.
- [ ] The Remove PM Type modal on a Not-in-plan machine lists its drafts and removes the chosen one at once; In-plan machines are unchanged.
- [ ] The detail shows drafts with a "Draft" tag and the same fields as live PM types. "+ Add PM type" opens Create PM for the machine and is disabled, with a hint, for an inactive machine.
- [ ] Thai strings for every new label.
- [ ] Service tests, Create PM submit-branching tests and a detail test; `npx tsc --noEmit` is clean; checked in the browser.
