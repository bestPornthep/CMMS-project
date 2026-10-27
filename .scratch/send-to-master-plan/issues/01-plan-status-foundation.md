# 01 โ€” Plan status foundation

**What to build:** Every machine has a plan status. At startup, machines that already have PM tasks are In plan and machines with none are Not in plan. The Master Plan page lists only in-plan machines, in the live view and in older revisions. Logging out and in again (which reloads data) must not lose anything created in this session.

**Blocked by:** None โ€” can start immediately.

**Status:** built

- [ ] A machine with at least one task of any status in the startup load starts In plan; a machine with none starts Not in plan (a machine with only Cancelled tasks counts as having tasks).
- [ ] A machine with no plan status at all (for example one created by an older code path) counts as In plan, so today's Master Plan does not change.
- [ ] The Master Plan page lists only in-plan machines. Search, department and product filters, year and marks keep working.
- [ ] Each revision snapshot keeps every machine's plan status; an older revision does not list a machine that was not in the plan when that revision was made.
- [ ] A data reload (also run after login) keeps machines created this session and their plan status, open and resolved requests, revisions and audit entries. The rule is written generically so drafts and preview tasks (later tickets) are kept too.
- [ ] If the backend returns a machine with the same id as a local one, it is not duplicated: the backend machine wins entirely (its fields, no local-only marker, plan status seeded like any backend machine).
- [ ] A machine that is In plan stays In plan on later loads even if its tasks are gone; a Not-in-plan backend machine becomes In plan if tasks appear on a later load. A plan status sent by the backend (future) wins over the seed.
- [ ] A failed reload leaves the current state untouched and rejects with the original error.
- [ ] A browser page reload clears everything introduced here (no localStorage).
- [ ] Service-level tests cover every rule above; `npx tsc --noEmit` is clean.
