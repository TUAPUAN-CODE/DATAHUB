-- DataSheet Pro — Step 13: which server runs which single-instance job (LINE alerts, RFID gateway, clean-ups). Idempotent.
IF OBJECT_ID(N'dbo.ServiceLeases', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ServiceLeases (
        name        NVARCHAR(100) NOT NULL CONSTRAINT PK_ServiceLeases PRIMARY KEY,
        holder      NVARCHAR(200) NOT NULL,
        expires_at  DATETIME2     NOT NULL
    );
END
GO
