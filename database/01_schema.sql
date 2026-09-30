-- =====================================================================
-- DataSheet Pro — Step 1: tables, indexes, seed roles
-- Run inside the DataSheetPro database (USE DataSheetPro;)
-- Notes
--  * All ids are UNIQUEIDENTIFIER. All timestamps are UTC (DATETIME2).
--  * Cascades are intentionally avoided on data tables; permanent purge
--    is performed in an explicit order by the API (services/purge.ts).
--  * Soft delete everywhere (is_deleted / deleted_at / delete_batch)
--    so the trash and rollback features can restore data.
-- =====================================================================

-- ---------- Users & roles ---------------------------------------------
CREATE TABLE Users (
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWID(),
    username        NVARCHAR(100)    NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
    email           NVARCHAR(255)    NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    password_hash   NVARCHAR(200)    NOT NULL,
    display_name    NVARCHAR(200)    NOT NULL,
    avatar_url      NVARCHAR(1000)   NULL,
    is_active       BIT              NOT NULL DEFAULT 1,
    last_login_at   DATETIME2        NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    created_by      UNIQUEIDENTIFIER NULL
);
GO

CREATE TABLE Roles (
    role_id     INT           NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    role_name   NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Roles_Name UNIQUE,
    description NVARCHAR(500) NULL
);
GO
-- role_id order matters: higher id = more privileges
INSERT INTO Roles (role_id, role_name, description) VALUES
 (1, N'user',   N'กรอก/แก้ไขข้อมูลในไฟล์ที่ได้รับสิทธิ์'),
 (2, N'master', N'สร้างฟอร์มเอกสาร จัดการโฟลเดอร์ที่ตัวเองสร้างหรือมีสิทธิ์'),
 (3, N'admin',  N'ทำได้ทุกอย่าง');
GO

CREATE TABLE UserRoles (
    user_id      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_UserRoles_User REFERENCES Users(user_id) ON DELETE CASCADE,
    role_id      INT              NOT NULL CONSTRAINT FK_UserRoles_Role REFERENCES Roles(role_id),
    assigned_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    assigned_by  UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_UserRoles PRIMARY KEY (user_id, role_id)
);
GO

CREATE TABLE RefreshTokens (
    token_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_RefreshTokens PRIMARY KEY DEFAULT NEWID(),
    user_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_RefreshTokens_User REFERENCES Users(user_id) ON DELETE CASCADE,
    token_hash  NVARCHAR(128)    NOT NULL,
    user_agent  NVARCHAR(500)    NULL,
    expires_at  DATETIME2        NOT NULL,
    created_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    revoked_at  DATETIME2        NULL
);
CREATE INDEX IX_RefreshTokens_User ON RefreshTokens(user_id);
GO

-- ---------- Folders & files -------------------------------------------
CREATE TABLE Folders (
    folder_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Folders PRIMARY KEY DEFAULT NEWID(),
    folder_name     NVARCHAR(300)    NOT NULL,
    parent_id       UNIQUEIDENTIFIER NULL CONSTRAINT FK_Folders_Parent REFERENCES Folders(folder_id),
    description     NVARCHAR(1000)   NULL,
    icon            NVARCHAR(100)    NOT NULL DEFAULT N'folder',
    color           NVARCHAR(9)      NOT NULL DEFAULT N'#1552F0',
    sort_order      INT              NOT NULL DEFAULT 0,
    created_by      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Folders_User REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,
    deleted_at      DATETIME2        NULL,
    deleted_by      UNIQUEIDENTIFIER NULL,
    delete_batch    UNIQUEIDENTIFIER NULL
);
CREATE INDEX IX_Folders_Parent  ON Folders(parent_id) WHERE is_deleted = 0;
CREATE INDEX IX_Folders_Deleted ON Folders(is_deleted, deleted_at);
GO

CREATE TABLE Files (
    file_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Files PRIMARY KEY DEFAULT NEWID(),
    file_name       NVARCHAR(300)    NOT NULL,
    folder_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Files_Folder REFERENCES Folders(folder_id),
    description     NVARCHAR(2000)   NULL,
    icon            NVARCHAR(100)    NOT NULL DEFAULT N'sheet',
    color           NVARCHAR(9)      NOT NULL DEFAULT N'#16A34A',
    status          NVARCHAR(20)     NOT NULL DEFAULT N'active',   -- active | archived
    created_by      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Files_User REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,
    deleted_at      DATETIME2        NULL,
    deleted_by      UNIQUEIDENTIFIER NULL,
    delete_batch    UNIQUEIDENTIFIER NULL
);
CREATE INDEX IX_Files_Folder  ON Files(folder_id) WHERE is_deleted = 0;
CREATE INDEX IX_Files_Creator ON Files(created_by);
CREATE INDEX IX_Files_Deleted ON Files(is_deleted, deleted_at);
GO

-- ---------- Sheets / columns / rows / cells (EAV) ----------------------
CREATE TABLE Sheets (
    sheet_id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Sheets PRIMARY KEY DEFAULT NEWID(),
    file_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Sheets_File REFERENCES Files(file_id),
    sheet_name      NVARCHAR(200)    NOT NULL,
    sort_order      INT              NOT NULL DEFAULT 0,
    tab_color       NVARCHAR(9)      NULL,
    created_by      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Sheets_User REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0
);
CREATE INDEX IX_Sheets_File ON Sheets(file_id, sort_order);
GO

CREATE TABLE Columns (
    column_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Columns PRIMARY KEY DEFAULT NEWID(),
    sheet_id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Columns_Sheet REFERENCES Sheets(sheet_id),
    column_name     NVARCHAR(200)    NOT NULL,
    data_type       NVARCHAR(30)     NOT NULL,
        -- varchar | text | int | float | date | datetime | boolean
        -- select | multi_select | url | email
    display_order   INT              NOT NULL DEFAULT 0,
    width           INT              NOT NULL DEFAULT 160,
    is_required     BIT              NOT NULL DEFAULT 0,
    default_value   NVARCHAR(1000)   NULL,        -- JSON encoded value
    placeholder     NVARCHAR(300)    NULL,
    validation_rule NVARCHAR(MAX)    NULL,        -- JSON {min,max,decimals,maxLength,pattern,...}
    select_options  NVARCHAR(MAX)    NULL,        -- JSON [{value,label,color}]
    description     NVARCHAR(500)    NULL,
    created_by      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Columns_User REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,
    deleted_at      DATETIME2        NULL
);
CREATE INDEX IX_Columns_Sheet ON Columns(sheet_id, display_order);
GO

CREATE TABLE Rows (
    row_id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Rows PRIMARY KEY DEFAULT NEWID(),
    sheet_id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Rows_Sheet REFERENCES Sheets(sheet_id),
    row_order       INT              NOT NULL DEFAULT 0,
    created_by      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Rows_User REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_by      UNIQUEIDENTIFIER NULL,
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,
    deleted_at      DATETIME2        NULL,
    deleted_by      UNIQUEIDENTIFIER NULL
);
CREATE INDEX IX_Rows_Sheet ON Rows(sheet_id, is_deleted, row_order) INCLUDE (created_at, updated_at);
GO

CREATE TABLE Cells (
    cell_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Cells PRIMARY KEY NONCLUSTERED DEFAULT NEWID(),
    row_id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Cells_Row REFERENCES Rows(row_id),
    column_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Cells_Column REFERENCES Columns(column_id),
    value_text      NVARCHAR(MAX)    NULL,
    value_int       BIGINT           NULL,
    value_float     FLOAT            NULL,
    value_date      DATETIME2        NULL,
    value_bool      BIT              NULL,
    value_json      NVARCHAR(MAX)    NULL,
    updated_by      UNIQUEIDENTIFIER NOT NULL,
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Cells_Row_Column UNIQUE CLUSTERED (row_id, column_id)
);
CREATE INDEX IX_Cells_Column_Num  ON Cells(column_id) INCLUDE (value_int, value_float, value_date, value_bool);
GO

-- ---------- History / audit -------------------------------------------
CREATE TABLE CellHistory (
    history_id      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CellHistory PRIMARY KEY,
    cell_id         UNIQUEIDENTIFIER NOT NULL,
    sheet_id        UNIQUEIDENTIFIER NOT NULL,
    row_id          UNIQUEIDENTIFIER NOT NULL,
    column_id       UNIQUEIDENTIFIER NOT NULL,
    old_value       NVARCHAR(MAX)    NULL,     -- JSON encoded
    new_value       NVARCHAR(MAX)    NULL,     -- JSON encoded
    change_source   NVARCHAR(30)     NOT NULL DEFAULT N'edit', -- edit|create|paste|rollback|type_change|undo
    changed_by      UNIQUEIDENTIFIER NOT NULL,
    changed_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    version_number  INT              NOT NULL DEFAULT 1
);
CREATE INDEX IX_CellHistory_Cell  ON CellHistory(cell_id, history_id DESC);
CREATE INDEX IX_CellHistory_Sheet ON CellHistory(sheet_id, changed_at);
CREATE INDEX IX_CellHistory_Row   ON CellHistory(row_id, changed_at);
GO

CREATE TABLE RowSnapshots (
    snapshot_id     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RowSnapshots PRIMARY KEY,
    row_id          UNIQUEIDENTIFIER NOT NULL,
    sheet_id        UNIQUEIDENTIFIER NOT NULL,
    snapshot_data   NVARCHAR(MAX)    NOT NULL,
    snapshot_type   NVARCHAR(20)     NOT NULL,    -- before_delete | manual
    created_by      UNIQUEIDENTIFIER NOT NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_RowSnapshots_Row ON RowSnapshots(row_id, created_at DESC);
GO

CREATE TABLE AuditLog (
    log_id          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    user_id         UNIQUEIDENTIFIER NOT NULL,
    action_type     NVARCHAR(50)     NOT NULL,
    entity_type     NVARCHAR(50)     NOT NULL,
    entity_id       NVARCHAR(100)    NOT NULL,
    file_id         UNIQUEIDENTIFIER NULL,
    sheet_id        UNIQUEIDENTIFIER NULL,
    old_value       NVARCHAR(MAX)    NULL,
    new_value       NVARCHAR(MAX)    NULL,
    ip_address      NVARCHAR(64)     NULL,
    user_agent      NVARCHAR(500)    NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Audit_File      ON AuditLog(file_id, created_at DESC);
CREATE INDEX IX_Audit_User      ON AuditLog(user_id, created_at DESC);
CREATE INDEX IX_Audit_CreatedAt ON AuditLog(created_at DESC);
GO

-- ---------- Access control --------------------------------------------
CREATE TABLE FileAccess (
    file_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_FileAccess_File REFERENCES Files(file_id),
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_FileAccess_User REFERENCES Users(user_id),
    permission      NVARCHAR(20)     NOT NULL,     -- read | write | manage
    granted_by      UNIQUEIDENTIFIER NOT NULL,
    granted_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at      DATETIME2        NULL,
    CONSTRAINT PK_FileAccess PRIMARY KEY (file_id, user_id)
);
CREATE INDEX IX_FileAccess_User ON FileAccess(user_id);
GO

CREATE TABLE FolderAccess (
    folder_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_FolderAccess_Folder REFERENCES Folders(folder_id),
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_FolderAccess_User REFERENCES Users(user_id),
    permission      NVARCHAR(20)     NOT NULL,
    granted_by      UNIQUEIDENTIFIER NOT NULL,
    granted_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at      DATETIME2        NULL,
    CONSTRAINT PK_FolderAccess PRIMARY KEY (folder_id, user_id)
);
CREATE INDEX IX_FolderAccess_User ON FolderAccess(user_id);
GO

CREATE TABLE AccessRequests (
    request_id      UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_AccessRequests PRIMARY KEY DEFAULT NEWID(),
    target_type     NVARCHAR(10)     NOT NULL,     -- file | folder
    file_id         UNIQUEIDENTIFIER NULL,
    folder_id       UNIQUEIDENTIFIER NULL,
    requester_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_AccessReq_User REFERENCES Users(user_id),
    permission      NVARCHAR(20)     NOT NULL,
    note            NVARCHAR(2000)   NOT NULL,     -- required reason
    duration_days   INT              NULL,         -- NULL = permanent
    status          NVARCHAR(20)     NOT NULL DEFAULT N'pending', -- pending|approved|rejected|cancelled
    reviewed_by     UNIQUEIDENTIFIER NULL,
    review_note     NVARCHAR(2000)   NULL,
    reviewed_at     DATETIME2        NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_AccessReq_Status    ON AccessRequests(status, created_at DESC);
CREATE INDEX IX_AccessReq_Requester ON AccessRequests(requester_id, created_at DESC);
GO

-- ---------- Personal data ---------------------------------------------
CREATE TABLE Favorites (
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Favorites_User REFERENCES Users(user_id) ON DELETE CASCADE,
    entity_type     NVARCHAR(10)     NOT NULL,   -- file | folder
    entity_id       UNIQUEIDENTIFIER NOT NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Favorites PRIMARY KEY (user_id, entity_type, entity_id)
);
GO

CREATE TABLE RecentFiles (
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_RecentFiles_User REFERENCES Users(user_id) ON DELETE CASCADE,
    file_id         UNIQUEIDENTIFIER NOT NULL,
    viewed_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_RecentFiles PRIMARY KEY (user_id, file_id)
);
CREATE INDEX IX_RecentFiles_User ON RecentFiles(user_id, viewed_at DESC);
GO

-- Per-user view preferences for a sheet: zoom, freeze, widths, heights, hidden columns
CREATE TABLE UserSheetPrefs (
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_UserSheetPrefs_User REFERENCES Users(user_id) ON DELETE CASCADE,
    sheet_id        UNIQUEIDENTIFIER NOT NULL,
    prefs_json      NVARCHAR(MAX)    NOT NULL,
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserSheetPrefs PRIMARY KEY (user_id, sheet_id)
);
GO

CREATE TABLE UserThemes (
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_UserThemes PRIMARY KEY
                        CONSTRAINT FK_UserThemes_User REFERENCES Users(user_id) ON DELETE CASCADE,
    theme_json      NVARCHAR(MAX)    NOT NULL,
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE SystemSettings (
    setting_key     NVARCHAR(100)    NOT NULL CONSTRAINT PK_SystemSettings PRIMARY KEY,
    setting_value   NVARCHAR(MAX)    NOT NULL,
    updated_by      UNIQUEIDENTIFIER NULL,
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE Notifications (
    notification_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY DEFAULT NEWID(),
    user_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Notifications_User REFERENCES Users(user_id) ON DELETE CASCADE,
    type            NVARCHAR(50)     NOT NULL,
    title           NVARCHAR(300)    NOT NULL,
    message         NVARCHAR(2000)   NOT NULL,
    link            NVARCHAR(500)    NULL,
    is_read         BIT              NOT NULL DEFAULT 0,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Notifications_User ON Notifications(user_id, is_read, created_at DESC);
GO

-- ---------- Dashboards ------------------------------------------------
CREATE TABLE Dashboards (
    dashboard_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Dashboards PRIMARY KEY DEFAULT NEWID(),
    file_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Dashboards_File REFERENCES Files(file_id),
    dashboard_name  NVARCHAR(300)    NOT NULL,
    layout_config   NVARCHAR(MAX)    NULL,     -- JSON {width,height,gridSize,snap}
    background      NVARCHAR(MAX)    NULL,     -- JSON {color,imageUrl,fit}
    sort_order      INT              NOT NULL DEFAULT 0,
    created_by      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Dashboards_User REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Dashboards_File ON Dashboards(file_id);
GO

CREATE TABLE DashboardWidgets (
    widget_id       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DashboardWidgets PRIMARY KEY DEFAULT NEWID(),
    dashboard_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Widgets_Dashboard REFERENCES Dashboards(dashboard_id) ON DELETE CASCADE,
    widget_type     NVARCHAR(30)     NOT NULL,
    title           NVARCHAR(300)    NULL,
    pos_x           FLOAT            NOT NULL DEFAULT 0,
    pos_y           FLOAT            NOT NULL DEFAULT 0,
    width           FLOAT            NOT NULL DEFAULT 400,
    height          FLOAT            NOT NULL DEFAULT 300,
    z_index         INT              NOT NULL DEFAULT 1,
    is_locked       BIT              NOT NULL DEFAULT 0,
    config          NVARCHAR(MAX)    NOT NULL DEFAULT N'{}',
    style_config    NVARCHAR(MAX)    NULL,
    data_source     NVARCHAR(MAX)    NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Widgets_Dashboard ON DashboardWidgets(dashboard_id);
GO
