---
trigger: always_on
---

---
name: token-optimization
description: Strict guidelines for maximizing AI signal-to-noise ratio, minimizing context window usage, and enforcing output brevity.
---
# Token Optimization Mandate
**Directive:** Maximize information density. Minimize token consumption in both contextual input and generated output.
## 1. Modular Context Loading (Input Optimization)
- **Skills over Prompts:** Execute workflows as small, composable skills[span_0](start_span)[span_0](end_span).
- **Targeted Retrieval:** Load only the files strictly required for the immediate task (e.g., `CONTEXT.md` for domain terminology or a specific ADR). Do not load the entire workspace simultaneously.
## 2. State Compaction (Context Management)
- **No Chat History Reliance:** Never force the agent to read through extended conversational logs to deduce the project state.
- **Handoff Protocol:** Use the `handoff` skill to compact the current context[span_1](start_span)[span_1](end_span). Summarize completed milestones, blockers, and next steps into `.ai_state.md` so subsequent sessions continue cleanly with minimal token usage[span_2](start_span)[span_2](end_span).
## 3. High-Density Communication
- **Zero Filler:** Eliminate conversational pleasantries. Use strict, imperative directives.
- **Ubiquitous Language:** You must strictly adhere to the project's domain dictionary to prevent wasting tokens on vague, conflicting terms, or hallucinatory variations[span_3](start_span)[span_3](end_span).
## 4. Output Minimization (Simplicity First)
- **Minimum Code:** Write the absolute minimum code required to solve the specific problem. Generate nothing speculative[span_4](start_span)[span_4](end_span).
- **Strict Scope:** Build no features beyond what was explicitly asked. Add no unrequested abstractions or "flexibility[span_5](start_span)"[span_5](end_span).
- **Refactor for Brevity:** If a solution takes 200 lines but can be achieved in 50, rewrite it immediately[span_6](start_span)[span_6](end_span).