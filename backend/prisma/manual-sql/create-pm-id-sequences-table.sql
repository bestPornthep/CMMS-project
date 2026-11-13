-- PM task id counters (frontend request #6). One counter per (asset, period);
-- never resets. Task ids are PM-{assetId}-{periodCode}-{seq}. No migration of
-- existing ids: old PM-XXX-0001 rows keep their ids, new tasks get the new
-- format. Apply with `prisma db execute`.
CREATE TABLE cmms_pm_id_sequences (
  asset_id    NVARCHAR(50) NOT NULL,
  period_code NVARCHAR(30) NOT NULL,
  last_seq    INT          NOT NULL CONSTRAINT DF_cmms_pm_id_sequences_last_seq DEFAULT 0,
  CONSTRAINT PK_cmms_pm_id_sequences PRIMARY KEY (asset_id, period_code)
);
