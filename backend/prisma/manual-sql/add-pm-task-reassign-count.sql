-- Backend requirement for PM Task Reassignment (Series Cascade), see
-- docs/backend_pm_reassign_api.html. Drives the frontend's "Reassign #N"
-- badge (task.reassignCount) on the Assigned PMs tab's Action column.
-- Applied via `prisma db execute` (raw SQL, no schema diffing) because this
-- shared legacy database is NOT managed by Prisma Migrate — see
-- /memories/repo/database-safety.md for why `prisma migrate dev`/`db push`
-- must never be used against it.
ALTER TABLE cmms_pm_tasks ADD reassign_count INT NOT NULL DEFAULT 0;
