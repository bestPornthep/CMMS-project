---
name: handoff-update
description: "Write an end-of-session handoff to .scratch/handoff.md. Use when finishing a session, completing a feature, or when asked to 'update the handoff', 'write handoff', or 'end session'. Overwrites the previous handoff — do not append."
---

# Handoff Update

Write a concise, complete handoff so the next session's agent can orient immediately without asking questions.

## Rules

- **Overwrite** `.scratch/handoff.md` — never append.
- **No code snippets** unless they encode a decision that prose cannot.
- **Be specific**: name files, signal names, and method names — not just "the service".
- **Future agent reads this cold** — assume zero context from this conversation.

## Process

### 1. Gather state

Before writing, collect:
- What feature/branch is currently in flight?
- What was completed this session (with file names)?
- What was left incomplete or deferred?
- Were any new anti-patterns or bugs discovered?
- What is the exact next step when the next session starts?

### 2. Write the handoff

Use this template — fill every section, delete none:

```markdown
# Handoff — Session <DATE>: <one-line summary>

## Branch
`<branch-name>` — <merge status: "not merged" | "merged to main">

## What was done this session

<bullet list of completed work with file names>

## In-flight / next steps

<numbered list of exactly what to do next, specific enough to start without re-reading this conversation>

## Known issues / deferred work

<anything discovered but NOT fixed — with reason why it was deferred>

## Anti-patterns to avoid

<only NEW patterns discovered this session — do not copy from previous handoffs>

## TypeScript / build status

`npx tsc --noEmit` — <0 errors | N errors (list them)>
`npm start` — <builds clean | fails with: ...>
```

### 3. Save

Write the result to `.scratch/handoff.md`. Confirm the path is correct before saving.
