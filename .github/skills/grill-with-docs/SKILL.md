---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design before building — ask probing questions, challenge assumptions, and surface ambiguities. Use when the user wants to discuss a feature before writing any code.
disable-model-invocation: true
---

# Grill With Docs

A relentless interview session to sharpen a plan or design. The goal is to surface all ambiguities, challenge assumptions, and reach a crisp shared understanding — before a single line of code is written.

## What this is for

Use this **before** writing a spec or starting implementation. It's the conversation that makes the spec trustworthy.

## Process

### 1. Read the domain context

Read `CONTEXT.md` and any relevant ADRs in `docs/adr/` before starting. Use the project's domain vocabulary in every question.

### 2. Grill relentlessly

Ask probing questions about the feature. Do not accept vague answers — push until each answer is concrete and actionable.

Good grilling questions:
- "What does success look like for a technician using this?"
- "What happens when X fails or is missing?"
- "Who can see/do this — which roles?"
- "What's the edge case when a delegation expires mid-flow?"
- "Is this a new screen or a change to an existing one?"
- "What data do we already have vs. what's missing from the API?"
- "Does this interact with PM schedules, or only one-off tasks?"

Ask one cluster of questions at a time. Wait for answers before moving on.

### 3. Capture decisions

As decisions crystallize, note them explicitly:
- "So we've agreed that: ..."
- Update `CONTEXT.md` with any new terms or clarified definitions.
- If a significant architectural decision is made, propose an ADR entry in `docs/adr/`.

### 4. Signal readiness

When the picture is clear enough that a spec could be written without guesswork, say so:

> "I think we have enough. Ready to run `/to-spec`?"

Do NOT move to `/to-spec` without explicit user confirmation.
