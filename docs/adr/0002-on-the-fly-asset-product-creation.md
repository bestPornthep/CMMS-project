# ADR 0002 — On-the-Fly Product and Asset Creation

**Date:** 2026-06-09  
**Status:** Accepted

## Context

The system originally assumed that Products (customer sites) and Assets (physical equipment) were managed out-of-band by admins. However, users frequently need to create preventive maintenance (PM) tasks for new customer sites or equipment on-the-fly. The frontend has been updated to allow users to type *new* Products and Assets directly into the "Create PM" form. If unrecognized, the frontend calls backend endpoints to register them.

## Decision

We implemented two new endpoints:
1. `POST /api/v1/products` to register a product, using the user-typed name as both the ID and the Name. When a user creates a product, the backend automatically grants them ownership by adding a mapping in `cmms_user_owned_products` inside a transaction.
2. `POST /api/v1/assets` to register an asset, checking that its location (Product) and department are valid, and validating that the user owns the location.

We decided to:
- Accept arbitrary user-typed names as Product IDs instead of strictly enforcing the `CUST-xxx` prefix format.
- Reject creation with a `409 Conflict` if the Product or Asset ID already exists, keeping the flow clean and alerting the client of desync.
- Protect both endpoints with the existing `JwtAuthGuard` and restrict their access to roles with `pm.create.submit` permissions (engineers, managers, admins), preventing technicians from creating them.

## Alternatives Considered

**Strict CUST-xxx prefix validation** — We could have rejected non-prefixed product IDs, but this would create friction in the user interface (users would have to know/input prefixes).

**Idempotent Find-or-Create** — If a duplicate was posted, we could return `200 OK` and ignore it. However, explicit `409 Conflict` errors are cleaner and follow REST standards, avoiding silent successes when two users try to create conflicting resources.

## Consequences

- The database will contain a mix of structured product IDs (like `CUST-001`) and natural language names (like `Apex Labs Thai`).
- The database schema does not have formal database-level foreign keys on `Asset.location` to `Product.id` (due to loose structure in the existing Prisma schema), so application-level verification is crucial to maintain database integrity.
- Product ownership checks now immediately reflect on the user's next request because `JwtStrategy` re-fetches user owned products dynamically.
