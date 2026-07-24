# 01 — Refactor exportFormData into 2-page structure

**Blocked by:** nothing

**What it delivers:**
The `exportFormData` computed signal in `pm-reports.component.ts` is rewritten to produce a 2-page-per-asset data structure. Page 1 covers Jan–Jun, page 2 covers Jul–Dec. Each page exposes: asset name, asset ID, year, month columns (0–5 or 6–11), the union checklist row list, per-item per-month `{ done, date, ww }` data, and the half label ("Jan–Jun" / "Jul–Dec"). The export modal and `generatePdf()` are untouched. No visual changes yet — this ticket only shapes the data layer that the template will consume.

**Acceptance criteria:**
- `exportFormData()` returns an array where each asset produces exactly 2 entries (`page 1` and `page 2`).
- Each entry has: `assetId`, `assetName`, `year`, `halfLabel` ("Jan–Jun" | "Jul–Dec"), `months` (array of 6 month indices), `checklistRows` (union of all checklist items for that asset that year), and per-row per-month `mark` (`'√'` or `''`), `date`, `ww`.
- WW is calculated as `Math.ceil((day + firstDayOfMonth) / 7)`.
- Date is formatted `DD Mon` (e.g. `14 Jul`).
- `npx tsc --noEmit` passes.
