# CONTEXT — AssetIntel CMMS

> Domain glossary. No implementation details — just terms and their meanings.

## Glossary

| Term | Definition |
|------|-----------|
| **Asset** | (Thai: เครื่องจักร) A physical piece of equipment at a customer site (e.g. Chiller Unit, CNC Lathe). Identified by a short code like `CH-P1-01`. Belongs to exactly one Department and one Product (location). |
| **Product** | A customer site/account. Identified by `CUST-xxx`. Engineers "own" products — ownership gates what tasks they can create and assign. |
| **Department** | An operational grouping: `Facility`, `Mechanic`, `Manufacturing`, `Maintenance`, `Test`. Users belong to one department (except admin/manager who span `All`). |
| **PM Task** | A Preventive Maintenance work order. Has a lifecycle: `Pending` → `In Progress` → `Pending Approval` → `Done` (or `Overdue`). Identified by `PM-{DEPT}-{nnnn}`. |
| **Template** | A reusable checklist blueprint for creating PM Tasks. Can be a **Personal Template** (scoped strictly to the creating user) or a **Default Template** (system-provided, currently mock-injected client-side in `pm.service.ts`). |
| **Delegation** | A time-limited grant from an engineer/manager to a technician, giving them permissions on specific products they wouldn't normally access. |
| **Audit Log** | An immutable record of security and system actions (delegations granted/revoked, templates created/deleted). |
| **Base Role** | One of `technician`, `engineer`, `manager`, `admin`. Determines default permissions. |
| **Owned Product** | A Product assigned to an Engineer. Engineers can only create/assign PM Tasks for products they own. |
| **Delegated Product** | A Product a Technician can temporarily access via an active Delegation. |
| **PM Schedule** | A rule that generates PM Tasks for an Asset, either automatically at a recurring frequency (e.g., Monthly) or just one-time. |

## Codebase conventions (enforced — do not break)

- All service methods that call the API return `Promise`. No `void` returns on async operations.
- Batch async operations use `Promise.allSettled()` — never a bare loop with no await.
- All Observable subscriptions in components use `takeUntilDestroyed(destroyRef)`.
- Route param + async signal reads must account for lazy-loaded data (re-check after load resolves).
- API `.catch()` only catches specific HTTP status codes (e.g. 404). All others rethrow.
- Comments that claim behavior must match the code, or be deleted.

## Session hygiene rules (follow every session, no exceptions)

- **Delete feature branches after merge** — both locally and from remote, every time without being asked.
  ```
  git branch -d feature/<name>
  git push origin --delete feature/<name>
  ```
- **Clean `.scratch` after a feature ships** — delete the feature's subdirectory (spec.md, issues/, etc.). Only `.scratch/handoff.md` should remain.

## Known technical debt (do not silently fix — needs a spec first)

- Default templates are mock-injected in `pm.service.ts`, not from backend.
- `[SeriesID: xxx]` in task descriptions is legacy; `pm-schedules` API migration is incomplete.
- `PUT /templates/:id` backend endpoint is missing.
- `POST /products` does not assign creator ownership rows.
- Refresh tokens are in-memory only (reset on server restart).

