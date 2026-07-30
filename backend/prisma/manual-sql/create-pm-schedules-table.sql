-- Creates the cmms_pm_schedules table backing the Prisma `PmSchedule` model.
-- The model has existed in schema.prisma since T4 (commit 32d24d8), but the
-- table itself was never created in the live DB — meaning POST /api/v1/pm-tasks/schedule
-- has been throwing 500 (P2021 TableDoesNotExist) in production since T4 shipped.
-- Discovered via the api-smoke.e2e-spec.ts full API smoke test.
CREATE TABLE cmms_pm_schedules (
  id              NVARCHAR(64)   NOT NULL PRIMARY KEY,
  title           NVARCHAR(200)  NOT NULL,
  description     NVARCHAR(MAX)  NULL,
  frequency       VARCHAR(50)    NOT NULL,
  asset_id        VARCHAR(30)    NOT NULL,
  product_id      VARCHAR(20)    NOT NULL,
  department      VARCHAR(50)    NOT NULL,
  estimated_hours DECIMAL(5, 2)  NOT NULL,
  checklist       NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
  parts_required  NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
  assigned_to     VARCHAR(20)    NULL,
  created_by      VARCHAR(20)    NULL,
  created_at      DATETIME2      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME2      NOT NULL DEFAULT CURRENT_TIMESTAMP
);
