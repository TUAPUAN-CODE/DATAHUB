-- DataSheet Pro — Step 7: which other sheets a formula column reads (LOOKUP / @source[Column]). Idempotent.
-- When a source sheet changes, the sheets that read it are recalculated.
IF OBJECT_ID(N'dbo.FormulaSources', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FormulaSources (
        column_id        UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Columns(column_id),
        sheet_id         UNIQUEIDENTIFIER NOT NULL,   -- the sheet that holds the formula column
        source_sheet_id  UNIQUEIDENTIFIER NOT NULL,   -- the sheet it reads from
        CONSTRAINT PK_FormulaSources PRIMARY KEY (column_id, source_sheet_id)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FormulaSources_Source' AND object_id = OBJECT_ID(N'dbo.FormulaSources'))
    CREATE INDEX IX_FormulaSources_Source ON dbo.FormulaSources (source_sheet_id) INCLUDE (sheet_id);
GO
