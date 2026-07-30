-- Pre-existing gap discovered during T5 seed verification (2026-07-30):
-- schema.prisma has declared PmTask.scheduleId (@map("schedule_id")) since
-- before this session, but the live cmms_pm_tasks table never had the
-- column added. This meant POST/PUT /pm-tasks/schedule (T4) was broken
-- against the real database. Applied via `prisma db execute` (no diffing) —
-- see /memories/repo/database-safety.md.
ALTER TABLE cmms_pm_tasks ADD schedule_id NVARCHAR(50) NULL;
