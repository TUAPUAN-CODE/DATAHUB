-- DataSheet Pro — Step 3: "union" sheets (rows gathered live from several sheets with identical columns)
-- Idempotent.
IF COL_LENGTH('dbo.Sheets', 'union_config') IS NULL
    ALTER TABLE Sheets ADD union_config NVARCHAR(MAX) NULL;   -- JSON {sources:[{sheetId}], createdBy, lastSyncAt, results:[...]}
GO
IF COL_LENGTH('dbo.Rows', 'source_row_id') IS NULL
    ALTER TABLE Rows ADD source_row_id UNIQUEIDENTIFIER NULL, source_sheet_id UNIQUEIDENTIFIER NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Rows_Source' AND object_id = OBJECT_ID(N'dbo.Rows'))
    CREATE INDEX IX_Rows_Source ON Rows(sheet_id, source_sheet_id, source_row_id);
GO
