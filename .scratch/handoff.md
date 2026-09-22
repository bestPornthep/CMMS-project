# Handoff — Session 2026-09-21 (cont'd 2): PM Master Plan approval workflow — design in progress, NOT built yet

## Branch
`feature/pm-checklist-audit-diff` — not merged. Layered on the same already-uncommitted prior work (see git status; the whole `backend/` folder and several `docs/backend_*.html` spec files remain deleted from disk, pre-existing, unrelated to this session).

## What was done this session

Small, concrete pieces are DONE. The big feature (the actual approval workflow) is still just a design discussion — **no pending-change model, no grid edit controls, no approvals page exist yet**.

1. **New permission `pm.masterplan.approve`** — added as its own dedicated toggle button in [profile-config.component.html](../frontend/src/app/pages/profile-config/profile-config.component.html) (label "PM Master Plan Approver"), NOT in the generic scrollable Permissions checklist. Logic in [profile-config.component.ts](../frontend/src/app/pages/profile-config/profile-config.component.ts):
   - `isMasterPlanApproverLocked()` → true for Manager/Admin (they already bypass all permission checks in `AuthService.hasPermission()`, so the button shows locked-on/checked and disabled for them).
   - `isMasterPlanApprover()` / `toggleMasterPlanApprover()` — toggles `'pm.masterplan.approve'` in `formPermissions` (the extras array), same mechanism as any other non-standard permission. Works for ANY role (e.g. a senior Engineer) since it's independent of role template — this was the explicit point of the feature ("more flexible for senior eng that work around on any project but can't approve").
   - No `AuthService` core logic changes were needed — `hasPermission()`'s existing generic fallback (`user.permissions?.includes(permission)`) already covers this new key.
   - Translations added to [translation.service.ts](../frontend/src/app/core/services/translation.service.ts): `'PM Master Plan Approver'`, `'Can/Cannot approve PM Master Plan changes'`, `'Included automatically for Manager/Admin.'`, `'Grant independently of role...'`. Note: `'Approve PM Master Plan Changes'` Thai key also exists but is now unused (leftover from an earlier draft that put it in the generic checklist before the dedicated-button redesign) — harmless, not cleaned up.

2. **Fixed a real, unrelated bug found while building #1**: in the same modal, `isRoleTemplateDisabled()` used to return `true` for the Technician/Engineer role buttons whenever `formDepartment === 'All'` — which meant once you picked Manager/Admin (which auto-sets department to `'All'`), you could **never click back down** to Technician/Engineer (buttons permanently disabled, dead end). Fixed in `profile-config.component.ts`: `isRoleTemplateDisabled()` now always returns `false`; `selectRoleTemplate()` instead auto-resets `formDepartment` to `DEPARTMENT_OPTIONS[0]` (`'Facility'`) when reverting from Manager/Admin down to Technician/Engineer while department is still `'All'` — mirrors the existing forward auto-switch (picking `'All'` in the department dropdown while on Technician/Engineer already auto-switches role to Manager).

3. **Backend gap note added**: [.github/instructions/backend.instructions.md](../.github/instructions/backend.instructions.md) "Known Gaps" section now has a bullet flagging that the PM Master Plan approval workflow is being built frontend-first/client-side-only (localStorage), no backend persistence yet — needs a real endpoint/table once the design settles.

## In-flight / next steps — THE MAIN THING TO PICK UP TOMORROW

**Nothing of the actual approval workflow is built.** This was all requirements-gathering via chat (not even `vscode_askQuestions`, mostly free-form back-and-forth) plus one aborted `vscode_askQuestions` call that failed validation (question message exceeded 200 chars) and was never retried before the user asked to stop and hand off. **Next session must re-ask these open design questions before writing code** — the user explicitly said "if you don't clear ask me, I can answer you," so don't guess on the unresolved points below.

### Confirmed decisions so far (safe to build on):
- **Trigger for approval**: only 4 change types need approval-gating on PM Master Plan: **add machine, remove machine, add PM type (frequency) to a machine, remove PM type from a machine.** Explicitly NOT date/WW rescheduling — the user said rolling due dates already happen automatically server-side, so requiring approval on every date roll "would be bad design."
- **Who can approve**: Manager/Admin (implicit, already bypass all permission checks) OR anyone explicitly granted `pm.masterplan.approve` via the new profile-config toggle (#1 above).
- **Who needs to go through approval**: anyone making one of the 4 change types who is NOT Manager/Admin and does NOT hold `pm.masterplan.approve`.
- **Non-approver submission requires a note**: user asked "let user note what they add for this submission" — the submit-for-approval action needs a required freeform note field where the submitter explains the change.
- **Approver needs to see what changed**: user asked for a diff/summary view, not just a raw record — "approver will know also what they change... design how approver can see the new change." User's principle: "think like a principal, anything can be simple make it simple."
- **Grid should show pending state visually**: a distinct pending marker/badge on the affected cell/row until approved or rejected (confirmed via the one successful `vscode_askQuestions` round).
- **Approve page**: brand-new standalone page (e.g. "PM Master Plan Approvals"), not a tab bolted onto PM Audit (confirmed via that same successful round).
- **Persistence**: client-side only for now (signal + localStorage, mirroring this app's existing dev-mock patterns), with a note left in `backend.instructions.md` (done, #3 above) that a real backend table/endpoint is needed later — no live backend to build against right now (same situation as `pm_master_plan` itself and several other recent features).

### STILL OPEN — must ask again next session (this is the part that got cut off):
1. **"Batch approve" / overwrite semantics** (user's own words: "if they have 10 approval they no need to approve all of that they approve only the latest thing and all of that will approve... I think this is hard to define stage but we should do like that", then separately: "I think change should be overwrite but keep what is new from the present version to let approver know that, how we design that"). My working interpretation (NOT YET CONFIRMED with user): store **at most one pending change record per subject** (subject = the machine being changed, or machine+PM-type for add/remove-type edits) — a second edit to the same subject while one is still pending **overwrites/replaces** that pending record's proposed payload (updated note, submitter, timestamp) rather than queuing a second entry. This way there's naturally only ever one item per subject for the approver to decide on, and approving it resolves everything for that subject in one action — no separate "batch approve" UI needed. **This needs explicit user confirmation before building** — I drafted a 3-question `vscode_askQuestions` call to nail down: (a) does overwrite happen for ANY change type on the same machine, or only when it's the exact same change type (e.g. does a pending "remove machine" get replaced/cancelled by a later "add PM type" on that same machine, or do they coexist as 2 separate pending items?); (b) on approver REJECT, does it just discard the pending record and notify the submitter (grid reverts to exactly as-is today), or stay visible in a rejected-history list?; (c) where do the add/remove controls live on the page — inline icons directly on the grid (+ row button, x per row, +/x per PM-type badge) vs. a separate "Propose Change" modal opened from a header button. **The `vscode_askQuestions` call itself failed** (one question's `message` field was too long — over the 200-char limit — never retried).
2. Once (1) is answered, still need to design: the "diff" view itself (what fields does approver see before/after for each of the 4 change types — e.g. add_machine has no "before" state at all, remove_machine before=active-fields/after="Deactivated", add/remove PM type before/after = the machine's frequency list).
3. Need a `PendingMasterPlanChange` model (new type in `pm.model.ts`), storage + submit/approve/reject methods (likely in `pm.service.ts`, localStorage-backed per the persistence decision above), a new route + nav entry for the approvals page, and grid-side UI (pending badge + add/remove controls) in `pm-master-plan.component.ts/html/.scss`. None of this exists yet.

## Known issues / deferred work

- Nothing new broken. The role-template revert bug (#2 above) was found and fixed this session, not deferred.
- Everything under "STILL OPEN" above is fully undesigned — do not assume any specific implementation when resuming; ask the 3 open questions first.

## Anti-patterns to avoid (new this session)

- `vscode_askQuestions` question `message` field has a hard 200-character limit — validate length before calling, or the whole call fails with no partial results. Keep each question's `message` short; put detail in the `question` text itself (200 chars, separate limit) or split across more, shorter questions instead of one long one.

## TypeScript / build status

`npx tsc --noEmit` — 0 errors (last run this session, after the profile-config permission button + revert-bug fix). Not re-run after the backend.instructions.md doc edit (doc-only, no impact expected).
`npm start` — dev server was running on port 4300 throughout, used for live browser context (PM Master Plan page open) but no new UI was built/tested this session beyond the profile-config modal.
