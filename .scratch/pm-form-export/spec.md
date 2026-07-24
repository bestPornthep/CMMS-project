# Spec — PM Form Export (Kimball Monthly PM Check Sheet)

## Problem Statement

The PM Reports page has an "Export Machine PM Form" button, but the form it generates does not match the official Kimball Electronics Monthly Preventive Maintenance Check Sheet (FM-MF-02). Engineers and managers cannot use the exported form for audit or compliance purposes because its layout, structure, and content differ from the required standard document.

## Solution

Replace the current export form layout with one that faithfully reproduces the Kimball Monthly PM Check Sheet format. For each selected Asset, the export produces two A4 landscape pages (Jan–Jun and Jul–Dec), with checklist rows drawn from the Asset's actual PM task checklist items for that year. Completed items are marked with √. The output is rendered as a print-ready HTML page and printed via `window.print()`.

## User Stories

1. As an engineer, I want to export a PM form for a machine that looks exactly like the official Kimball check sheet, so I can use it for audit evidence without reformatting.
2. As an engineer, I want each exported form to show the machine's name and asset ID in the header, so the form is clearly linked to the correct equipment.
3. As an engineer, I want the form to display the full year (split across two pages: Jan–Jun and Jul–Dec), so I can see PM completion status across all months at a glance.
4. As an engineer, I want checklist rows to come from the actual PM task checklist items for that machine, so the form reflects what was really inspected.
5. As an engineer, I want a √ symbol in the month column when a checklist item was completed that month, and blank when no PM task was done that month, so the completion status is immediately clear.
6. As an engineer, I want the WW (Work Week of Month) row to show the week number of the month when the PM was completed, so scheduling compliance can be verified.
7. As an engineer, I want the Date row to show the actual completion date (day + month abbreviation), so the exact execution date is traceable.
8. As an engineer, I want the Signature and Approved rows to be left blank, so the printed form can be physically signed after printing.
9. As an engineer, I want the Remark and Spare part replacement fields to be blank, so they can be filled in manually if needed.
10. As an engineer, I want the footer to show the correct reference document numbers (Ref.Doc.P-EN-7.5-01, QSD: 10000040841, DC: 374750, FM-MF-02, Effective Date: 27/Sep/2021, Rev.L), so the form is a valid controlled document.
11. As an engineer, I want to select which machines to include in the export and what year, so I can generate forms for a specific audit scope.
12. As a manager, I want to export PM forms for multiple machines at once, so I can prepare a full audit package efficiently.
13. As an engineer, I want each machine's form to begin on a new print page, so pages from different machines don't run together.
14. As an engineer, I want the form header to show the Kimball Electronics Thailand Ltd. logo area and the "MONTHLY PREVENTIVE MAINTENANCE CHECK SHEET" title, so the form is immediately recognisable.
15. As an engineer, I want the Year to appear in the form header, so the annual scope of the form is explicit.

## Implementation Decisions

### Layout structure
- Each Asset produces **2 HTML pages** in the print view:
  - Page 1: months Jan, Feb, Mar, Apr, May, Jun (columns 1–6)
  - Page 2: months Jul, Aug, Sep, Oct, Nov, Dec (columns 7–12)
- Each page has: header block, meta row (machine name / machine no / year), a data table, signature rows, remark/spare rows, footer.
- `page-break-after: always` is used between pages in print CSS.

### Header block
| Section | Content |
|---------|---------|
| Logo | "Kimball Electronics Thailand Ltd." text logo |
| Title | "MONTHLY PREVENTIVE MAINTENANCE CHECK SHEET" |
| Year | Right-aligned, from `exportYear()` signal |

### Meta row
| Field | Value |
|-------|-------|
| Machine Name | `asset.name` |
| Machine No. | `asset.id` (placeholder; field designed to swap to a longer machine number when model is extended) |
| Month range | Jan–Jun or Jul–Dec label in the header of each half |

### Data table columns
- **Description** column (leftmost) — checklist item text
- **WW** row — Work Week of Month, calculated from `task.completedAt`
- **Date** row — `DD Mon` format (e.g. `14 Jul`)
- **6 month columns** — show `√` if the item was completed that month, blank otherwise

### Checklist rows
- Drawn from the **union of all checklist items** across PM tasks for that Asset in the selected year.
- Items are deduplicated by exact text match.
- If a PM task exists for a month, every item from its `task.checklist[]` that has `done: true` gets a `√` in that month's column.

### WW calculation
Week of Month = `Math.ceil((dayOfMonth + dayOfWeekOfMonthStart) / 7)`

### Signature / Approved / Remark / Spare parts
All blank — no data from PM task is injected into these rows.

### Footer (hardcoded, same on all pages)
```
Ref.Doc.P-EN-7.5-01      QSD: QSD: 10000040841
DC: 374750   FM-MF-02    Effective Date: 27/Sep/2021   Rev.L
```

### Legend row
```
Remark: √ = For checking is complete    − = Does not checking
```

### Output
`window.print()` — no PDF library dependency. Print CSS hides the main report table and shows only the form pages.

### Modules changed
- `pm-reports.component.ts` — replace `exportFormData` computed with new logic, update `generatePdf()`
- `pm-reports.component.html` — replace the `pm-form-print-only` section with new 2-page layout
- `pm-reports.component.scss` — replace/add print CSS for the new form layout

## Testing Decisions

- The seam to test is `exportFormData` computed signal — it is a pure transformation of `pmTasks()` signal + `exportYear()` + `exportSelectedAssets()` signals.
- Good tests verify the output structure: correct checklist rows, correct `√` placement, correct WW/date values, correct page split.
- Test with: a task with 3 checklist items completed in March → page 1 should show `√` under Mar for all 3 items; page 2 should show blank for all months.
- No new testing seams needed — existing signal pattern in `pm.service.ts` / component is the seam.

## Out of Scope

- Adding a full machine number field to the `Asset` model (noted as future work).
- Filling Remark or Spare parts from task data.
- Generating a downloadable `.pdf` binary file (no jsPDF).
- Per-machine reference doc numbers (all share the same hardcoded footer).
- Historical tasks older than the selected export year.

## Further Notes

- The current `exportFormData` computed can be refactored in place — no new service methods needed.
- Print CSS must set paper size to A4 landscape and remove all browser default headers/footers (`@page { size: A4 landscape; margin: 8mm; }`).
- The Asset model's `id` field should have a TODO comment noting it is the placeholder for the full machine number.
