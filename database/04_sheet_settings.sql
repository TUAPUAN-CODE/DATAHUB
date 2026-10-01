-- DataSheet Pro — Step 4: per-sheet settings (which columns appear in the filter / sort bar above the table). Idempotent.
IF COL_LENGTH('dbo.Sheets', 'settings_json') IS NULL
    ALTER TABLE Sheets ADD settings_json NVARCHAR(MAX) NULL;   -- JSON {filterColumns: [columnId] | null}
GO
