# AssetIntel CMMS

CMMS web app for Kimball Electronics — PM lifecycle: create → assign → execute → approve → audit.

- **Domain:** See [`CONTEXT.md`](../CONTEXT.md) for glossary, roles (`admin/manager/engineer/technician`), known technical debt, and codebase conventions.
- **Frontend (primary):** Angular 21 standalone, Signals, Tailwind v4 + SCSS tokens, no Angular Material. See [`.github/instructions/frontend.instructions.md`](instructions/frontend.instructions.md).
- **Backend (may be stale):** NestJS 11 + Prisma 7 + MSSQL. Source of truth for expected API = `frontend/src/app/core/services/api.service.ts`. See [`.github/instructions/backend.instructions.md`](instructions/backend.instructions.md).

## Session Start

**Always read [`.scratch/handoff.md`](../.scratch/handoff.md) first.** It records the current project state, in-flight work, and known anti-patterns from previous sessions. Do not duplicate its content — just read it.

## Build & Type-Check Commands

Run these to verify work before marking a ticket done:

| Action | Command (run from workspace root) |
|--------|-----------------------------------|
| Frontend type-check | `cd frontend && npx tsc --noEmit` |
| Frontend dev server | `cd frontend && npm start` (port 4300) |
| Frontend tests | `cd frontend && npm test` |
| Backend type-check | `cd backend && npx tsc --noEmit` |
| Backend dev server | `cd backend && npm run start:dev` |
| Backend tests | `cd backend && npm test` |

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/app/core/services/api.service.ts` | Source of truth for all API contracts |
| `frontend/src/app/core/services/pm.service.ts` | PM domain state + business logic |
| `frontend/src/app/core/services/auth.service.ts` | Session state, permission checks, delegation |
| `frontend/src/app/core/models/pm.model.ts` | All PM domain TypeScript types |
| `backend/prisma/schema.prisma` | Database schema (MSSQL, `cmms_` table prefix) |
| `backend/src/cmms.service.ts` | Shared helpers: `generateTaskId()`, `logAudit()` |

## Feature Workflow (follow every time, no exceptions)

1. **Grill** — `/grill-with-docs` until requirements are clear. No code before user confirms.
2. **Spec** — `/to-spec` → `.scratch/<slug>/spec.md`
3. **Tickets** — `/to-tickets` → `.scratch/<slug>/issues/`. Quiz user on granularity.
4. **Branch** — `git checkout -b feature/<slug>`. Never commit to `main` directly.
5. **Build** — `/implement` per ticket, drives `/tdd`. Run `npx tsc --noEmit` after each ticket.
6. **Self-review** — `/code-review` against `main`. Fix all findings. **No new bugs before user sees code.**
7. **User review** — present, fix, iterate until satisfied.
8. **Merge & handoff** — merge to `main`, **overwrite** `.scratch/handoff.md` with current state so the next session knows exactly where things stand.

## Language

User writes in Thai or English. Always respond in English.
