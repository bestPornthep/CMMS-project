# ADR 0001 — Eager Delegation Lookup on Every Request

**Date:** 2026-06-08  
**Status:** Accepted

## Context

JWT access tokens have an 8-hour lifespan. Delegation state (active/revoked) changes independently of token issuance. If delegation data were embedded in the JWT payload, a revoked delegation would remain effective until the token expired — up to 8 hours after revocation.

## Decision

`JwtStrategy.validate()` ignores the delegation data in the JWT payload and instead performs two live DB queries on every authenticated request:
1. `user + ownedProducts` — to get current role and owned products
2. `delegation.findMany` — to get currently active delegations for the user

This makes delegation revocation take effect on the very next API call.

## Alternatives Considered

**Embed delegation data in JWT payload** — simpler, zero extra queries, but revocations only take effect after token expiry (up to 8 hours). Unacceptable for a security-sensitive permission grant/revoke flow.

**Short-lived tokens (e.g. 5 minutes)** — reduces stale window but forces frequent refresh calls and complicates the frontend.

## Consequences

- Every authenticated request costs 2 extra DB round-trips.
- At this system's scale (internal tool, low concurrency), this is acceptable.
- If load increases significantly, introduce a short-TTL cache (e.g. 30-second in-memory or Redis) keyed by `employeeId` to batch the DB hits without sacrificing meaningful freshness.
