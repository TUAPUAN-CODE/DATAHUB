-- DataSheet Pro — Step 2: share links + social login identities
-- Idempotent: safe to run more than once (the API also applies it automatically on start-up).

IF OBJECT_ID(N'dbo.ShareLinks', N'U') IS NULL
BEGIN
    CREATE TABLE ShareLinks (
        link_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ShareLinks PRIMARY KEY DEFAULT NEWID(),
        file_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ShareLinks_File REFERENCES Files(file_id),
        token         NVARCHAR(64)     NOT NULL CONSTRAINT UQ_ShareLinks_Token UNIQUE,
        permission    NVARCHAR(20)     NOT NULL,              -- level granted to signed-in users: read | write | manage
        allow_guest   BIT              NOT NULL DEFAULT 1,    -- people without an account may view (read-only)
        expires_at    DATETIME2        NULL,
        is_active     BIT              NOT NULL DEFAULT 1,
        created_by    UNIQUEIDENTIFIER NOT NULL,
        created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        access_count  INT              NOT NULL DEFAULT 0,
        last_used_at  DATETIME2        NULL
    );
    CREATE INDEX IX_ShareLinks_File ON ShareLinks(file_id);
END
GO

IF OBJECT_ID(N'dbo.OAuthIdentities', N'U') IS NULL
BEGIN
    CREATE TABLE OAuthIdentities (
        provider    NVARCHAR(20)     NOT NULL,                 -- google | microsoft
        subject     NVARCHAR(200)    NOT NULL,                 -- provider's stable user id
        user_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_OAuth_User REFERENCES Users(user_id) ON DELETE CASCADE,
        email       NVARCHAR(255)    NULL,
        created_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_OAuthIdentities PRIMARY KEY (provider, subject)
    );
    CREATE INDEX IX_OAuth_User ON OAuthIdentities(user_id);
END
GO
