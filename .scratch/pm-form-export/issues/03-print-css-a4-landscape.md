# 03 — Print CSS for A4 landscape check sheet

**Blocked by:** 02

**What it delivers:**
`pm-reports.component.scss` (and/or the global `styles.scss` `@media print` block) is updated so that when the user clicks "Generate PDF" → `window.print()`:

- `@page` rule sets `size: A4 landscape; margin: 8mm;`
- All browser-default print headers and footers are suppressed.
- The main report table (`.pm-reports-page`) is hidden in print mode.
- The form pages (`.pm-form-print-only`) are visible only in print mode (hidden in screen view).
- Table borders, fonts, and cell sizes produce a clean, compact layout that fits on a single A4 landscape page per half-year.
- The Kimball logo text area, title, and reference footer are styled to match the PDF proportions.
- Checklist text wraps correctly within the Description column without overflowing.

**Acceptance criteria:**
- Clicking "Generate PDF" → print dialog → "Save as PDF" produces a document where each page matches the Kimball check sheet proportions.
- No UI regression on the normal (non-print) reports page.
- `npx tsc --noEmit` passes.
