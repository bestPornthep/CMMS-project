-- Machine lifecycle + cancel tracking (frontend request #5).
-- Additive only. Existing machines stay active and count as "in the Master
-- Plan" so nothing disappears from the plan. Apply with `prisma db execute`
-- (this DB is not managed by Prisma Migrate).
ALTER TABLE cmms_assets ADD is_active BIT NOT NULL CONSTRAINT DF_cmms_assets_is_active DEFAULT 1;
ALTER TABLE cmms_assets ADD work_center NVARCHAR(50) NULL;
ALTER TABLE cmms_assets ADD deactivated_at DATETIME2 NULL;
ALTER TABLE cmms_assets ADD is_in_master_plan BIT NOT NULL CONSTRAINT DF_cmms_assets_is_in_master_plan DEFAULT 1;

ALTER TABLE cmms_pm_schedules ADD is_active BIT NOT NULL CONSTRAINT DF_cmms_pm_schedules_is_active DEFAULT 1;

ALTER TABLE cmms_pm_tasks ADD cancelled_reason NVARCHAR(200) NULL;
ALTER TABLE cmms_pm_tasks ADD cancelled_at DATETIME2 NULL;
