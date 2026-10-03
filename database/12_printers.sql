-- DataSheet Pro — Step 12: slip printers (PFCM print-agent) and which printer a device → sheet binding prints to. Idempotent.
IF OBJECT_ID(N'dbo.Printers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Printers (
        printer_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Printers PRIMARY KEY DEFAULT NEWID(),
        printer_name   NVARCHAR(100)    NOT NULL,
        agent_url      NVARCHAR(300)    NOT NULL,           -- print-agent, e.g. http://172.48.0.115:9100
        printer_host   NVARCHAR(200)    NULL,               -- IP / name of the PC that shares the printer (\\host\share)
        printer_share  NVARCHAR(100)    NULL,
        dot_width      INT              NULL,               -- 576 = 80 mm @ 203 dpi
        enabled        BIT              NOT NULL DEFAULT 1,
        created_by     UNIQUEIDENTIFIER NOT NULL,
        created_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
IF COL_LENGTH(N'dbo.DeviceBindings', N'printer_id') IS NULL ALTER TABLE dbo.DeviceBindings ADD printer_id UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH(N'dbo.DeviceBindings', N'slip_json') IS NULL ALTER TABLE dbo.DeviceBindings ADD slip_json NVARCHAR(MAX) NULL;
GO
