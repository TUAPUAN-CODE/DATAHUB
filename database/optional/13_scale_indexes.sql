-- ============================================================================
-- OPTIONAL — NOT applied automatically (this folder is skipped by the startup migration).
-- For sheets with hundreds of thousands to millions of rows. A DBA runs it in a maintenance window, on a COPY first,
-- then re-measures with `npm run bench` (see docs/SCALE.md). Each index is ~ (number of cells) × 20–30 bytes: check the disk first.
-- Standard Edition cannot build indexes ONLINE: the table is locked while an index is being built.
-- ============================================================================

-- Filter / sort by a NUMBER column: seek instead of reading the whole column
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cells_Col_Int' AND object_id = OBJECT_ID(N'dbo.Cells'))
    CREATE INDEX IX_Cells_Col_Int ON dbo.Cells (column_id, value_int);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cells_Col_Float' AND object_id = OBJECT_ID(N'dbo.Cells'))
    CREATE INDEX IX_Cells_Col_Float ON dbo.Cells (column_id, value_float);
GO
-- Filter / sort by a DATE / DATETIME column; also what the Traceback time links and the LINE alerts use (range on value_date)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cells_Col_Date' AND object_id = OBJECT_ID(N'dbo.Cells'))
    CREATE INDEX IX_Cells_Col_Date ON dbo.Cells (column_id, value_date);
GO
-- Not included on purpose: TEXT. value_text is NVARCHAR(MAX), which cannot be an index key.
-- Text sort / filter on a huge sheet needs a persisted computed column (LEFT(value_text, 200)) + the query builder using it:
-- decide that AFTER measuring with `npm run bench` (docs/SCALE.md, step 3).
