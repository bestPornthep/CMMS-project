---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges — written as one file per ticket under .scratch/<feature-slug>/issues/.
disable-model-invocation: true
---

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

Tickets are stored locally under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. No external issue tracker is configured.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a spec path as an argument, read its full body.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary from `CONTEXT.md`, and respect ADRs in `docs/adr/`.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

**Vertical slice rules:**
- Each slice cuts a narrow but COMPLETE path through every relevant layer (service, component, template, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:
- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Write tickets to local files

Write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first).

Use the template below — one ticket per file, never a single combined file.

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

Avoid specific file paths or code snippets — they go stale fast.

Work the **frontier**: any ticket whose blockers are all done.
