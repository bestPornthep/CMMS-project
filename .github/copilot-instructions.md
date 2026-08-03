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

## Feature Workflow — MANDATORY. Every step. Every time. No exceptions. No shortcuts.

> **If you are about to skip any step because the change "seems small", stop. Small changes have caused regressions. Follow every step regardless of perceived size.**

### Steps (must be completed in order — do not proceed to the next until the current one is done)

1. **Grill** — Use `/grill-with-docs`. Ask questions one cluster at a time. Do NOT write any code until the user explicitly confirms requirements are clear and complete.

2. **Spec** — Run `/to-spec`. Write spec to `.scratch/<slug>/spec.md`. Do NOT proceed until the file exists and the user has reviewed it.

3. **Tickets** — Run `/to-tickets`. Write individual ticket files to `.scratch/<slug>/issues/`. Quiz user on granularity. Do NOT proceed until tickets are approved.

4. **Branch** — Run `git checkout -b feature/<slug>`. **Never commit directly to `main` or any existing feature branch.** If a branch already exists for unrelated work, create a new one scoped to this feature.

5. **Build** — Implement one ticket at a time. Run `npx tsc --noEmit` after each ticket. Run `npm start` before marking a ticket done (catches Angular template errors that `tsc` misses).

6. **Self-review** — Run `/code-review` comparing feature branch against `main`. Fix every finding. **Do not show code to the user until this step is clean.**

7. **User review** — Present changes. Fix all feedback. Iterate until the user explicitly says they are satisfied.

8. **Merge & handoff** — Merge feature branch to `main`. Delete the feature branch (local + remote). Clean `.scratch/<slug>/`. **Overwrite** `.scratch/handoff.md` with current state.

### Hard rules (violations are never acceptable)

- **No code before step 1 is confirmed.** Not even a "quick fix."
- **No skipping spec/tickets for "simple" changes.** Simplicity is judged after grilling, not before.
- **No committing to `main` or an existing branch** — always a fresh `feature/<slug>` branch.
- **No merging without self-review.** The user sees clean code or nothing.
- **No ending a session without updating `handoff.md`.**
- If you realise mid-implementation that you skipped a step, stop, acknowledge it to the user, and complete the skipped step before continuing.

## Language

User writes in Thai or English. Always respond in English.
