-- ============================================================================
-- SKELETON ONLY — a DBA must adapt names / IPs / version and review before running. The SSMS wizard
-- (Object Explorer › Always On High Availability › New Availability Group Wizard) does all of this with checks; prefer it.
-- Prerequisites: both machines in ONE Windows Server Failover Cluster (+ a file-share / cloud witness for automatic failover with 2 nodes),
-- "Always On Availability Groups" enabled in SQL Server Configuration Manager on both, same SQL Server version, same port.
-- ============================================================================

-- 1) on BOTH servers: mirroring endpoint
-- CREATE ENDPOINT [Hadr_endpoint] STATE = STARTED AS TCP (LISTENER_PORT = 5022)
--   FOR DATABASE_MIRRORING (ROLE = ALL, ENCRYPTION = REQUIRED ALGORITHM AES);

-- 2) on the primary: the database must be in FULL recovery, and have a full + log backup restored WITH NORECOVERY on the secondary
-- ALTER DATABASE [DataSheetPro] SET RECOVERY FULL;
-- BACKUP DATABASE [DataSheetPro] TO DISK = N'\\share\DataSheetPro.bak' WITH INIT;
-- BACKUP LOG      [DataSheetPro] TO DISK = N'\\share\DataSheetPro.trn' WITH INIT;
--   (secondary)  RESTORE DATABASE [DataSheetPro] FROM DISK = N'\\share\DataSheetPro.bak' WITH NORECOVERY;
--   (secondary)  RESTORE LOG      [DataSheetPro] FROM DISK = N'\\share\DataSheetPro.trn' WITH NORECOVERY;

-- 3) on the primary: the availability group (synchronous commit + automatic failover = both copies identical, no data loss)
-- CREATE AVAILABILITY GROUP [AG_DataSheet]
--   WITH (AUTOMATED_BACKUP_PREFERENCE = SECONDARY, DB_FAILOVER = ON)   -- Standard Edition: add BASIC
--   FOR DATABASE [DataSheetPro]
--   REPLICA ON
--     N'SQL-A' WITH (ENDPOINT_URL = N'TCP://SQL-A.yourdomain:5022', AVAILABILITY_MODE = SYNCHRONOUS_COMMIT, FAILOVER_MODE = AUTOMATIC, SEEDING_MODE = MANUAL),
--     N'SQL-B' WITH (ENDPOINT_URL = N'TCP://SQL-B.yourdomain:5022', AVAILABILITY_MODE = SYNCHRONOUS_COMMIT, FAILOVER_MODE = AUTOMATIC, SEEDING_MODE = MANUAL);
-- -- on the secondary:  ALTER AVAILABILITY GROUP [AG_DataSheet] JOIN;  ALTER DATABASE [DataSheetPro] SET HADR AVAILABILITY GROUP = [AG_DataSheet];

-- 4) the LISTENER = the name the app connects to (DB_HOST in server/.env), it follows whichever server is primary
-- ALTER AVAILABILITY GROUP [AG_DataSheet] ADD LISTENER N'DATASHEET-DB' (WITH IP ((N'172.48.0.120', N'255.255.255.0')), PORT = 1433);

-- 5) the SQL login the app uses must exist on BOTH servers with the SAME SID (logins are not inside the database):
--    on the primary: SELECT name, sid FROM sys.sql_logins WHERE name = N'<login>';
--    on the secondary: CREATE LOGIN [<login>] WITH PASSWORD = N'...', SID = 0x<sid from the primary>;
-- Agent jobs, linked servers and server-level settings are not replicated either.
