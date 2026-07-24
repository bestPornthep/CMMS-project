---
name: implement
description: Implement a piece of work based on a spec or set of tickets. Use when the user says "implement", "build this", "start coding", or references a ticket or spec.
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use `/tdd` where possible, at pre-agreed seams.

Run typechecking regularly (`npx tsc --noEmit` in `frontend/`), single test files regularly, and the full test suite once at the end.

Once done, use `/code-review` to review the work.

Commit your work to the current branch.

## Project context

- Frontend is Angular 21 standalone. All components must be standalone.
- State via Angular Signals — no new RxJS BehaviorSubjects for state.
- Styling via Tailwind v4 + the existing SCSS design tokens in `frontend/src/styles.scss`. No new CSS frameworks.
- No Angular Material — use existing shared components under `frontend/src/app/shared/components/`.
- Follow conventions already present in the codebase. Match file naming, folder structure, and import patterns from the nearest existing page or component.
