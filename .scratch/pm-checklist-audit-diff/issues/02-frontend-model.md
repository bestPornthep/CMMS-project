# Ticket 2 — Frontend: AuditLog model + mock data

- `pm.model.ts`: add `changes?: string[]` to `AuditLog`.
- `api.service.ts` mock/dev data for `getAuditLogs()` (if any mock entries simulate a checklist-update action): add a sample entry with `changes` populated, so the UI has something to render during frontend-only development.

Verify: `npx tsc --noEmit` clean.
