-- =====================================================================
-- DataSheet Pro — Step 0: create the database (run in SSMS on master)
-- Alternatively run:  cd server && npm run db:init
-- =====================================================================
IF DB_ID(N'DataSheetPro') IS NULL
BEGIN
    CREATE DATABASE DataSheetPro COLLATE Thai_CI_AS;
END
GO
-- OPENJSON requires compatibility level 130+ (SQL Server 2016+)
ALTER DATABASE DataSheetPro SET COMPATIBILITY_LEVEL = 150;
GO
