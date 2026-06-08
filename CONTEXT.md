# CONTEXT — AssetIntel CMMS

> Domain glossary. No implementation details — just terms and their meanings.

## Glossary

| Term | Definition |
|------|-----------|
| **Asset** | A physical piece of equipment at a customer site (e.g. Chiller Unit, CNC Lathe). Identified by a short code like `CH-P1-01`. Belongs to exactly one Department and one Product (location). |
| **Product** | A customer site/account. Identified by `CUST-xxx`. Engineers "own" products — ownership gates what tasks they can create and assign. |
| **Department** | An operational grouping: `Facility`, `Mechanic`, `Manufacturing`, `Maintenance`, `Test`. Users belong to one department (except admin/manager who span `All`). |
| **PM Task** | A Preventive Maintenance work order. Has a lifecycle: `Pending` → `In Progress` → `Pending Approval` → `Done` (or `Overdue`). Identified by `PM-{DEPT}-{nnnn}`. |
| **Template** | A reusable checklist blueprint for creating PM Tasks. Scoped to a department. |
| **Delegation** | A time-limited grant from an engineer/manager to a technician, giving them permissions on specific products they wouldn't normally access. |
| **Audit Log** | An immutable record of security and system actions (delegations granted/revoked, templates created/deleted). |
| **Base Role** | One of `technician`, `engineer`, `manager`, `admin`. Determines default permissions. |
| **Owned Product** | A Product assigned to an Engineer. Engineers can only create/assign PM Tasks for products they own. |
| **Delegated Product** | A Product a Technician can temporarily access via an active Delegation. |
