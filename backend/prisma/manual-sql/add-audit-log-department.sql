-- T3: add nullable department column to cmms_audit_logs
-- Applied via `prisma db execute` (raw SQL, no schema diffing) because this
-- shared legacy database is NOT managed by Prisma Migrate — see
-- /memories/repo/database-safety.md for why `prisma migrate dev` must never
-- be used against it.
ALTER TABLE cmms_audit_logs ADD department NVARCHAR(255) NULL;
