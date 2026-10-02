-- DataSheet Pro — Step 6: archive of exported (signed) documents. Idempotent.
-- The PDF itself is kept on disk (ARCHIVE_DIR, not publicly served); this table keeps who / when / what and a SHA-256 of the file.
IF OBJECT_ID(N'dbo.ExportArchive', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ExportArchive (
        archive_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ExportArchive_Id DEFAULT NEWID() PRIMARY KEY,
        file_id        UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Files(file_id),
        sheet_id       UNIQUEIDENTIFIER NULL,
        title          NVARCHAR(300)    NOT NULL,
        template_name  NVARCHAR(200)    NULL,
        stored_name    NVARCHAR(100)    NOT NULL,
        original_name  NVARCHAR(300)    NOT NULL,
        size_bytes     BIGINT           NOT NULL,
        sha256         CHAR(64)         NOT NULL,
        page_count     INT              NULL,
        row_count      INT              NULL,
        meta_json      NVARCHAR(MAX)    NULL,   -- JSON: prompts, signers, filters, note
        created_by     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Users(user_id),
        created_at     DATETIME2        NOT NULL CONSTRAINT DF_ExportArchive_Created DEFAULT SYSUTCDATETIME(),
        is_deleted     BIT              NOT NULL CONSTRAINT DF_ExportArchive_Del DEFAULT 0,
        deleted_at     DATETIME2        NULL,
        deleted_by     UNIQUEIDENTIFIER NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ExportArchive_File' AND object_id = OBJECT_ID(N'dbo.ExportArchive'))
    CREATE INDEX IX_ExportArchive_File ON dbo.ExportArchive (file_id, created_at DESC);
GO
