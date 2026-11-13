-- One PM per frequency per asset (frontend request #2). The primary key is the
-- race-safe guard: two simultaneous creators cannot both claim the same
-- (asset, frequency). Frequencies are stored normalized (see frequency.util.ts:
-- lowercase/trim + aliases such as "1 month(s)" = "monthly").
-- Apply with `prisma db execute`; run the checks below first.
CREATE TABLE cmms_pm_types (
  asset_id             NVARCHAR(50)  NOT NULL,
  normalized_frequency NVARCHAR(50)  NOT NULL,
  schedule_id          NVARCHAR(50)  NULL,
  task_id              NVARCHAR(100) NULL,
  created_at           DATETIME2     NOT NULL CONSTRAINT DF_cmms_pm_types_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_cmms_pm_types PRIMARY KEY (asset_id, normalized_frequency)
);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Legacy data can already hold several schedules for one asset+frequency
-- (e.g. ENG-TST-1). One claim per group is created for the earliest schedule;
-- the REPORT below lists groups with more than one schedule so the DB team can
-- decide what to retire. The API pre-check blocks new duplicates either way.

-- Report (read-only): duplicate schedules per asset + normalized frequency.
;WITH norm AS (
  SELECT id, asset_id, created_at,
         CASE LOWER(LTRIM(RTRIM(frequency)))
           WHEN '1 day(s)' THEN 'daily'
           WHEN '7 day(s)' THEN 'weekly'
           WHEN '1 week(s)' THEN 'weekly'
           WHEN '1 month(s)' THEN 'monthly'
           WHEN '3 month(s)' THEN 'quarterly'
           WHEN '12 month(s)' THEN 'yearly'
           WHEN '1 year(s)' THEN 'yearly'
           ELSE LOWER(LTRIM(RTRIM(frequency)))
         END AS nf
  FROM cmms_pm_schedules
)
SELECT asset_id, nf AS normalized_frequency, COUNT(*) AS schedules
FROM norm
GROUP BY asset_id, nf
HAVING COUNT(*) > 1;

-- Backfill: earliest schedule per (asset, normalized frequency).
;WITH norm AS (
  SELECT id, asset_id, created_at,
         CASE LOWER(LTRIM(RTRIM(frequency)))
           WHEN '1 day(s)' THEN 'daily'
           WHEN '7 day(s)' THEN 'weekly'
           WHEN '1 week(s)' THEN 'weekly'
           WHEN '1 month(s)' THEN 'monthly'
           WHEN '3 month(s)' THEN 'quarterly'
           WHEN '12 month(s)' THEN 'yearly'
           WHEN '1 year(s)' THEN 'yearly'
           ELSE LOWER(LTRIM(RTRIM(frequency)))
         END AS nf
  FROM cmms_pm_schedules
), ranked AS (
  SELECT id, asset_id, nf, ROW_NUMBER() OVER (PARTITION BY asset_id, nf ORDER BY created_at, id) AS rn
  FROM norm
)
INSERT INTO cmms_pm_types (asset_id, normalized_frequency, schedule_id)
SELECT asset_id, nf, id FROM ranked WHERE rn = 1;
