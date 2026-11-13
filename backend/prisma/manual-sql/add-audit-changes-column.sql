-- Checklist change audit trail (frontend request #3). Additive, nullable.
-- Stores a JSON array of human-readable diff lines. Apply with `prisma db execute`.
ALTER TABLE cmms_audit_logs ADD changes NVARCHAR(MAX) NULL;
