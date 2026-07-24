---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants to write tests.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop.

Every section applies on every cycle — consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` so test names and interface vocabulary match the project's domain language, and respect ADRs in `docs/adr/`.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification — "user can submit PM record" tells you exactly what capability exists — and survives refactors because it doesn't care about internal structure.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam.

For this project:
- **Angular components**: test via the component's public inputs/outputs and template interactions, not internal methods
- **Services (pm.service, auth.service)**: test via public method calls and signal/observable emissions
- **Guards/interceptors**: test via router and HTTP outcomes, not internal logic

Ask: "What's the public interface, and which seams should we test?"

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through a side channel. The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological** — the assertion recomputes the expected value the way the code does — it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth.
- **Horizontal slicing** — writing all tests first, then all implementation. Work in **vertical slices** instead — one test → one implementation → repeat.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.

## Project test setup

- Test runner: **Vitest** (configured in `frontend/`)
- Run a single test file: `npx vitest run <path>`
- Run all tests: `npx vitest run` from `frontend/`
- Typechecking: `npx tsc --noEmit` from `frontend/`
