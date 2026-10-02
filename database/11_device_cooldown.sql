-- DataSheet Pro — Step 11: reader start commands per device, and the "do not read the same card again within N minutes" memory shared by all readers of a sheet. Idempotent.
IF COL_LENGTH(N'dbo.Devices', N'init_hex') IS NULL ALTER TABLE dbo.Devices ADD init_hex NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.Devices', N'start_hex') IS NULL ALTER TABLE dbo.Devices ADD start_hex NVARCHAR(200) NULL;
GO
IF OBJECT_ID(N'dbo.DeviceCooldown', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeviceCooldown (
        sheet_id  UNIQUEIDENTIFIER NOT NULL,
        value     NVARCHAR(300)    NOT NULL,
        last_at   DATETIME2        NOT NULL,
        CONSTRAINT PK_DeviceCooldown PRIMARY KEY (sheet_id, value)
    );
END
GO
