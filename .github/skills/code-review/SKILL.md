---
name: code-review
description: Review the changes since a fixed point (commit, branch, or merge-base) along two axes — Standards (does the code follow this repo's conventions?) and Spec (does the code match what the ticket/spec asked for?). Use when the user wants to review a branch, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards and conventions?
- **Spec** — does the code faithfully implement the originating ticket / spec?

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff: `git diff <fixed-point>...HEAD` and commit list: `git log <fixed-point>..HEAD --oneline`. Confirm the diff is non-empty before proceeding.

### 2. Identify the spec source

Look for the originating spec/ticket in this order:
1. A path the user passed as an argument
2. A ticket file under `.scratch/` matching the branch name or feature
3. A spec file under `docs/` or root `*.md` spec files
4. If nothing found, ask the user. If no spec exists, skip the Spec axis and note it.

### 3. Standards sources

Check against:
- `CLAUDE.md` at root (behavioral/coding guidelines)
- `.github/copilot-instructions.md` (project conventions)
- `.github/instructions/frontend.instructions.md` (Angular/frontend rules)
- `.github/instructions/backend.instructions.md` (NestJS/backend rules — note backend may be out of date)

**Fowler smell baseline** (always applies on top of repo standards):
- **Mysterious Name** — rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — extract the shared shape.
- **Feature Envy** — move the method onto the data it envies.
- **Data Clumps** — bundle repeated field groups into one type.
- **Primitive Obsession** — give domain concepts their own small type.
- **Repeated Switches** — replace with polymorphism or a shared map.
- **Shotgun Surgery** — one logical change scattered across many files; gather into one module.
- **Divergent Change** — one module edited for unrelated reasons; split it.
- **Speculative Generality** — abstraction for needs the spec doesn't have; delete it.
- **Message Chains** — hide long `a.b().c()` chains behind one method.
- **Middle Man** — a class that mostly just delegates; cut it.
- **Refused Bequest** — subclass ignoring most of what it inherits; use composition.

The repo overrides the baseline. Baseline smells are always judgement calls, not hard violations.

### 4. Run both axes

**Standards review:**
- Per file/hunk: (a) every violation of a documented standard (cite the file + rule); (b) any Fowler smell spotted (name it, quote the hunk).
- Distinguish hard violations (documented standard) from judgement calls (smells).
- Skip anything that tooling (ESLint, TypeScript) already enforces.
- Under 400 words.

**Spec review:**
- (a) Requirements the spec asked for that are missing or partial.
- (b) Behaviour in the diff that wasn't asked for (scope creep).
- (c) Requirements that look implemented but where the implementation looks wrong.
- Quote the spec line for each finding.
- Under 400 words.

### 5. Report

Present findings under `## Standards` and `## Spec` headings. Do NOT merge or rerank across axes.

End with a one-line summary: total findings per axis, and the worst issue within each axis (if any).

## Why two axes

A change can pass one axis and fail the other:
- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the ticket asked but breaks project conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
