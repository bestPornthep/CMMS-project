-- T5: add is_default column to cmms_templates
-- Applied via `prisma db execute` (raw SQL, no schema diffing) because this
-- shared legacy database is NOT managed by Prisma Migrate — see
-- /memories/repo/database-safety.md for why `prisma migrate dev`/`db push`
-- must never be used against it.
ALTER TABLE cmms_templates ADD is_default BIT NOT NULL DEFAULT 0;
