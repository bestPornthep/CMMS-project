-- PM Master Plan approval workflow (frontend request #7). Additive only.
-- Apply with `prisma db execute`.
CREATE TABLE cmms_masterplan_changes (
  id             NVARCHAR(50)  NOT NULL CONSTRAINT PK_cmms_masterplan_changes PRIMARY KEY,
  asset_id       NVARCHAR(50)  NOT NULL,
  asset_name     NVARCHAR(200) NOT NULL,
  department     NVARCHAR(50)  NOT NULL,
  proposed_state NVARCHAR(MAX) NOT NULL,
  submitted_by   NVARCHAR(50)  NOT NULL,
  submitted_at   DATETIME2     NOT NULL,
  note           NVARCHAR(MAX) NOT NULL,
  history        NVARCHAR(MAX) NOT NULL CONSTRAINT DF_cmms_masterplan_changes_history DEFAULT '[]',
  status         NVARCHAR(10)  NOT NULL CONSTRAINT DF_cmms_masterplan_changes_status DEFAULT 'pending',
  resolved_by    NVARCHAR(50)  NULL,
  resolved_at    DATETIME2     NULL,
  reject_reason  NVARCHAR(500) NULL
);
CREATE INDEX IX_cmms_masterplan_changes_asset ON cmms_masterplan_changes (asset_id);
-- One open card per machine; resolved (approved / rejected) cards are kept.
CREATE UNIQUE INDEX UX_cmms_masterplan_changes_open_asset
  ON cmms_masterplan_changes (asset_id) WHERE status = 'pending';

CREATE TABLE cmms_masterplan_versions (
  id         NVARCHAR(50)  NOT NULL CONSTRAINT PK_cmms_masterplan_versions PRIMARY KEY,
  label      NVARCHAR(10)  NOT NULL CONSTRAINT UQ_cmms_masterplan_versions_label UNIQUE,
  created_at DATETIME2     NOT NULL CONSTRAINT DF_cmms_masterplan_versions_created_at DEFAULT SYSUTCDATETIME(),
  assets     NVARCHAR(MAX) NOT NULL
);

CREATE TABLE cmms_draft_pm_types (
  asset_id             NVARCHAR(50)  NOT NULL,
  normalized_frequency NVARCHAR(50)  NOT NULL,
  frequency            NVARCHAR(50)  NOT NULL,
  detail               NVARCHAR(MAX) NOT NULL,
  updated_by           NVARCHAR(50)  NOT NULL,
  updated_at           DATETIME2     NOT NULL CONSTRAINT DF_cmms_draft_pm_types_updated_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_cmms_draft_pm_types PRIMARY KEY (asset_id, normalized_frequency)
);
