-- DataSheet Pro — Step 8: LINE alerts. Idempotent.
-- LineTargets: LINE users/groups that talked to the bot (so a manager can pick one instead of typing an id).
-- AlertNotified: which (column, row, level) was already sent, so each level is announced only once per row.
IF OBJECT_ID(N'dbo.LineTargets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.LineTargets (
        target_id   NVARCHAR(64)  NOT NULL CONSTRAINT PK_LineTargets PRIMARY KEY,
        kind        NVARCHAR(10)  NOT NULL,            -- user | group | room
        label       NVARCHAR(200) NULL,
        last_seen   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
IF OBJECT_ID(N'dbo.AlertNotified', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlertNotified (
        column_id   UNIQUEIDENTIFIER NOT NULL,
        row_id      UNIQUEIDENTIFIER NOT NULL,
        level_idx   INT              NOT NULL,
        sent_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AlertNotified PRIMARY KEY (column_id, row_id, level_idx)
    );
END
GO
