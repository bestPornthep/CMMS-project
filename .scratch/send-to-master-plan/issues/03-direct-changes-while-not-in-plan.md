# 03 โ€” Direct changes while Not in plan

**What to build:** Add Machine creates the machine at once as Not in plan. Edit, Deactivate and Reactivate on a Not-in-plan machine apply at once with no approval, while an In-plan machine still creates approval requests as today. The machine list gets a plan badge and a plan filter.

**Blocked by:** 01 โ€” Plan status foundation

**Status:** built

- [ ] Add Machine creates the machine immediately: it appears in the list and in Create PM's machine picker, is Not in plan, is marked local-only, creates no approval card and makes no backend create call. The toast says it is Not in plan and how to continue.
- [ ] A duplicate machine id (case-insensitive, trimmed) is refused by the service, not only the form. Missing required fields and unauthorized users get a clear error and nothing is created.
- [ ] Edit on a Not-in-plan machine applies at once, with no card and no audit entry. Saving unchanged values changes nothing and tells the user so. Edit on an In-plan machine keeps creating approval requests (including the existing no-op guard).
- [ ] Deactivate and Reactivate on a Not-in-plan machine apply at once with the same local effects as today (deactivation time, task cascade). On an In-plan machine they keep creating approval requests.
- [ ] Generic request submission refuses a Not-in-plan machine with a clear message.
- [ ] The list shows a plan badge (Not in plan / In plan) next to Status. The amber "Pending approval" badge is unchanged. A plan filter (All / In plan / Not in plan) works together with the status filter and the search box.
- [ ] Every action failure shows a toast with the real message, and the form keeps its values on failure.
- [ ] Thai strings for every new label.
- [ ] Service tests for the routing and failure paths; `npx tsc --noEmit` is clean; checked in the browser.
