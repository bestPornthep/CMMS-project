-- Backend requirement for Profile Config (User Management), see
-- docs/backend_profile_config_users.html. Drives the Active/Inactive badge
-- and Deactivate/Reactivate button on the Profile Config user list, and
-- login rejection of deactivated accounts.
-- Applied via `prisma db execute` (raw SQL, no schema diffing) because this
-- shared legacy database is NOT managed by Prisma Migrate — see
-- /memories/repo/database-safety.md for why `prisma migrate dev`/`db push`
-- must never be used against it.
ALTER TABLE cmms_users ADD is_active BIT NOT NULL DEFAULT 1;
