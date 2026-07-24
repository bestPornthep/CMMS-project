# 02 — Replace print HTML template with Kimball check sheet layout

**Blocked by:** 01

**What it delivers:**
The `pm-form-print-only` section in `pm-reports.component.html` is replaced with a layout that faithfully reproduces the Kimball Monthly PM Check Sheet. For each entry in `exportFormData()`:

- **Header block**: "Kimball Electronics Thailand Ltd." logo text on the left, "MONTHLY PREVENTIVE MAINTENANCE CHECK SHEET" title centre, "Year: YYYY" top-right.
- **Meta row**: Machine Name (left), Machine No. (centre), Month range label (right).
- **Column headers**: Description | WW | Date | [Jan|Feb|Mar|Apr|May|Jun] or [Jul|Aug|Sep|Oct|Nov|Dec]
- **WW row**: shows the Work Week value for each month that has a completed task, blank otherwise.
- **Date row**: shows `DD Mon` for each month that has a completed task, blank otherwise.
- **Checklist rows**: one row per item in `checklistRows`; each month cell shows `√` or blank.
- **Signature row**: blank.
- **Approved row**: blank.
- **Remark row**: blank.
- **Spare part replacement row**: blank.
- **Legend line**: `Remark: √ = For checking is complete  − = Does not checking`
- **Footer**: `Ref.Doc.P-EN-7.5-01 | QSD: QSD: 10000040841 | DC: 374750  FM-MF-02 | Effective Date: 27/Sep/2021  Rev.L`

Each page entry gets `page-break-after: always` so machines and halves print on separate pages.

**Acceptance criteria:**
- The rendered HTML visually matches the PDF form structure.
- Page 1 shows Jan–Jun columns, page 2 shows Jul–Dec columns for the same machine.
- Multiple machines each produce their own 2-page block.
- `npx tsc --noEmit` passes.
