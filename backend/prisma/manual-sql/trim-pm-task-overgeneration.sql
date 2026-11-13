-- Cleanup for the nightly PM task over-generation bug (frontend request #1).
-- topUpSchedules() used to extend each schedule one more year ahead every
-- night, so schedules now hold tasks decades into the future. Due dates do not
-- overlap, so de-duplicating by date would remove nothing: trim far-future,
-- never-touched Pending rows instead.
--
-- Run STEP 1 first and review. Then set @Expected in STEP 2 to the total from
-- step 1; the delete rolls back if the live count differs. Do not run against
-- the shared dev DB without DB-team approval.
--
-- A schedule's keep-limit is one year after the later of "now" and its first
-- due date, so a series legitimately starting months from now keeps its full
-- first-year buffer.

-- ── STEP 1: dry run (read-only) ─────────────────────────────────────────────
;WITH first_due AS (
  SELECT schedule_id, MIN(next_due_date) AS first_due
  FROM cmms_pm_tasks
  WHERE schedule_id IS NOT NULL
  GROUP BY schedule_id
), keep_limit AS (
  SELECT schedule_id,
         DATEADD(year, 1, CASE WHEN first_due > SYSUTCDATETIME() THEN first_due ELSE SYSUTCDATETIME() END) AS keep_until
  FROM first_due
)
SELECT t.schedule_id, COUNT(*) AS rows_to_delete, MIN(t.next_due_date) AS earliest, MAX(t.next_due_date) AS latest
FROM cmms_pm_tasks t
JOIN keep_limit k ON k.schedule_id = t.schedule_id
WHERE t.status = 'Pending'
  AND t.completed_at IS NULL AND t.approved_at IS NULL AND t.actual_hours IS NULL AND t.record_notes IS NULL
  AND t.next_due_date > k.keep_until
GROUP BY t.schedule_id
ORDER BY rows_to_delete DESC;

-- Same-date duplicates inside one schedule (report only, resolve manually).
SELECT schedule_id, next_due_date, COUNT(*) AS copies
FROM cmms_pm_tasks
WHERE schedule_id IS NOT NULL
GROUP BY schedule_id, next_due_date
HAVING COUNT(*) > 1;

-- ── STEP 2: delete (set @Expected from step 1 before running) ───────────────
DECLARE @Expected INT = -1;  -- <- replace with the step-1 total

BEGIN TRANSACTION;

;WITH first_due AS (
  SELECT schedule_id, MIN(next_due_date) AS first_due
  FROM cmms_pm_tasks
  WHERE schedule_id IS NOT NULL
  GROUP BY schedule_id
), keep_limit AS (
  SELECT schedule_id,
         DATEADD(year, 1, CASE WHEN first_due > SYSUTCDATETIME() THEN first_due ELSE SYSUTCDATETIME() END) AS keep_until
  FROM first_due
)
DELETE t
FROM cmms_pm_tasks t
JOIN keep_limit k ON k.schedule_id = t.schedule_id
WHERE t.status = 'Pending'
  AND t.completed_at IS NULL AND t.approved_at IS NULL AND t.actual_hours IS NULL AND t.record_notes IS NULL
  AND t.next_due_date > k.keep_until;

IF @@ROWCOUNT <> @Expected
BEGIN
  PRINT 'Row count differs from @Expected - rolling back.';
  ROLLBACK TRANSACTION;
END
ELSE
  COMMIT TRANSACTION;
