-- DataSheet Pro — Step 10: devices (RFID readers, HTTP/IoT senders), their events and which sheets receive them. Idempotent.
IF OBJECT_ID(N'dbo.Devices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Devices (
        device_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Devices PRIMARY KEY DEFAULT NEWID(),
        device_name   NVARCHAR(100)    NOT NULL,
        kind          NVARCHAR(20)     NOT NULL,              -- rfid_tcp | http
        host          NVARCHAR(200)    NULL,
        port          INT              NULL,
        api_key_hash  NVARCHAR(100)    NULL,                  -- http devices: sha256 of the key (shown once)
        enabled       BIT              NOT NULL DEFAULT 0,
        status        NVARCHAR(20)     NOT NULL DEFAULT N'off', -- off | connected | disconnected | error
        last_seen     DATETIME2        NULL,
        last_error    NVARCHAR(300)    NULL,
        created_by    UNIQUEIDENTIFIER NOT NULL,
        created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
IF OBJECT_ID(N'dbo.DeviceBindings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeviceBindings (
        binding_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DeviceBindings PRIMARY KEY DEFAULT NEWID(),
        device_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Devices(device_id),
        sheet_id     UNIQUEIDENTIFIER NOT NULL,
        enabled      BIT              NOT NULL DEFAULT 1,
        profile_id   NVARCHAR(40)     NULL,                  -- scan format of the sheet (null = detect)
        run_as_user  UNIQUEIDENTIFIER NOT NULL,              -- events are written in this person's name and rights
        created_at   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_DeviceBindings UNIQUE (device_id, sheet_id)
    );
END
GO
IF OBJECT_ID(N'dbo.DeviceEvents', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeviceEvents (
        event_id     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DeviceEvents PRIMARY KEY,
        device_id    UNIQUEIDENTIFIER NOT NULL,
        value        NVARCHAR(300)    NOT NULL,
        received_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        outcome      NVARCHAR(20)     NOT NULL,              -- ok | error | unbound
        detail       NVARCHAR(1000)   NULL
    );
    CREATE INDEX IX_DeviceEvents_Device ON dbo.DeviceEvents (device_id, event_id DESC);
END
GO
