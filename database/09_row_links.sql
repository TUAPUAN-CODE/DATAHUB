-- DataSheet Pro — Step 9: links between rows (mixing: inputs → new lot; later: trolley contents, traceback). Idempotent.
IF OBJECT_ID(N'dbo.RowLinks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RowLinks (
        link_id        BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RowLinks PRIMARY KEY,
        sheet_id       UNIQUEIDENTIFIER NOT NULL,           -- sheet of the child row (where the mix happened)
        parent_row_id  UNIQUEIDENTIFIER NOT NULL,           -- what was used
        child_row_id   UNIQUEIDENTIFIER NOT NULL,           -- what was made
        qty            FLOAT            NULL,               -- amount taken from the parent (in the unit of the cut column)
        role           NVARCHAR(30)     NOT NULL DEFAULT N'mix_input',
        created_by     UNIQUEIDENTIFIER NOT NULL,
        created_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_RowLinks_Parent ON dbo.RowLinks (parent_row_id) INCLUDE (child_row_id, qty, role);
    CREATE INDEX IX_RowLinks_Child  ON dbo.RowLinks (child_row_id)  INCLUDE (parent_row_id, qty, role);
END
GO
