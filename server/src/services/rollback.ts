import { Request } from 'express';
import { q, T, Tx, withTx } from '../config/db';
import { AuthUser } from '../middleware/auth';
import { auditMany } from '../shared/audit';
import { CellValue, normalizeValue, toColumnDef } from '../shared/cellValue';
import { reqMeta, safeJson } from '../shared/http';
import { emitToSheet } from '../socket';
import { loadColumns, writeCell } from './cellWriter';

export interface RollbackPlan {
  at: Date;
  cellChanges: { rowId: string; columnId: string; value: CellValue }[];
  rowsToDelete: string[];
  rowsToRestore: string[];
}

/**
 * Point-in-time plan: for every cell changed after `at`, the old_value of the first change
 * after `at` is exactly the value it had at `at`. Rows created after `at` are soft-deleted;
 * rows deleted after `at` (that existed at `at`) are restored. Structure (columns) is not changed.
 */
export async function planRollback(sheetId: string, at: Date, rowId?: string, tx?: Tx): Promise<RollbackPlan> {
  const params: Record<string, unknown> = { s: T.uuid(sheetId), at: T.dt(at) };
  let rowFilter = '';
  if (rowId) {
    params.r = T.uuid(rowId);
    rowFilter = 'AND h.row_id = @r';
  }
  const cells = await q(
    `;WITH firstAfter AS (
       SELECT h.row_id, h.column_id, h.old_value,
              ROW_NUMBER() OVER (PARTITION BY h.cell_id ORDER BY h.changed_at ASC, h.history_id ASC) AS rn
       FROM CellHistory h
       WHERE h.sheet_id = @s AND h.changed_at > @at ${rowFilter}
     )
     SELECT fa.row_id, fa.column_id, fa.old_value FROM firstAfter fa
     JOIN Rows r ON r.row_id = fa.row_id
     WHERE fa.rn = 1 AND r.created_at <= @at`,
    params,
    tx,
  );
  const rowParams: Record<string, unknown> = { s: T.uuid(sheetId), at: T.dt(at) };
  let rf = '';
  if (rowId) {
    rowParams.r = T.uuid(rowId);
    rf = 'AND row_id = @r';
  }
  const toDelete = rowId
    ? []
    : await q(
        `SELECT row_id FROM Rows WHERE sheet_id = @s AND is_deleted = 0 AND created_at > @at`,
        rowParams,
        tx,
      );
  const toRestore = await q(
    `SELECT row_id FROM Rows WHERE sheet_id = @s AND is_deleted = 1 AND deleted_at > @at AND created_at <= @at ${rf}`,
    rowParams,
    tx,
  );
  return {
    at,
    cellChanges: cells.map((c) => ({
      rowId: c.row_id,
      columnId: c.column_id,
      value: safeJson<CellValue>(c.old_value, null),
    })),
    rowsToDelete: toDelete.map((r) => r.row_id),
    rowsToRestore: toRestore.map((r) => r.row_id),
  };
}

export async function applyRollback(
  user: AuthUser,
  sheet: { sheet_id: string; file_id: string },
  plan: RollbackPlan,
  meta: { req?: Request; reason?: string; scope: 'sheet' | 'row'; rowId?: string },
) {
  const cols = await loadColumns(sheet.sheet_id, null, true);
  const colMap = new Map(cols.map((c) => [c.column_id, toColumnDef(c)]));
  const result = await withTx(async (tx) => {
    let changed = 0;
    for (const id of plan.rowsToRestore) {
      await q(`UPDATE Rows SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = SYSUTCDATETIME(),
               updated_by = @u WHERE row_id = @r`, { r: T.uuid(id), u: T.uuid(user.id) }, tx);
    }
    for (const c of plan.cellChanges) {
      const col = colMap.get(c.columnId);
      if (!col) continue;
      const n = normalizeValue(col, c.value, { skipRequired: true });
      const value = n.ok ? n.value : null;
      const r = await writeCell(tx, {
        sheetId: sheet.sheet_id,
        rowId: c.rowId,
        col,
        value,
        userId: user.id,
        source: 'rollback',
      });
      if (r.changed) changed++;
    }
    for (const id of plan.rowsToDelete) {
      await q(`UPDATE Rows SET is_deleted = 1, deleted_at = SYSUTCDATETIME(), deleted_by = @u WHERE row_id = @r`,
        { r: T.uuid(id), u: T.uuid(user.id) }, tx);
    }
    await auditMany(
      [
        {
          userId: user.id,
          action: meta.scope === 'sheet' ? 'sheet_rollback' : 'row_rollback',
          entityType: meta.scope,
          entityId: meta.rowId ?? sheet.sheet_id,
          fileId: sheet.file_id,
          sheetId: sheet.sheet_id,
          newValue: {
            at: plan.at.toISOString(),
            reason: meta.reason ?? null,
            cellsChanged: changed,
            rowsDeleted: plan.rowsToDelete.length,
            rowsRestored: plan.rowsToRestore.length,
          },
        },
      ],
      meta.req,
      tx,
    );
    return { cellsChanged: changed, rowsDeleted: plan.rowsToDelete.length, rowsRestored: plan.rowsToRestore.length };
  });
  emitToSheet(sheet.sheet_id, 'rows:changed', { sheetId: sheet.sheet_id, action: 'rollback', by: user.displayName }, reqMeta(meta.req).socketId);
  return result;
}
