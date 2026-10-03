-- DataSheet Pro — Step 5: PDF export layouts stored per file (copied together with the file). Idempotent.
IF COL_LENGTH('dbo.Files', 'pdf_templates') IS NULL
    ALTER TABLE Files ADD pdf_templates NVARCHAR(MAX) NULL;   -- JSON array of PDF templates
GO
