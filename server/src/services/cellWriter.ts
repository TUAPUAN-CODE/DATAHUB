import { Request } from 'express';
import { idList, jsonParam, q, q1, T, Tx, withTx } from '../config/db';
import { AuthUser } from '../middleware/auth';
import { auditMany } from '../shared/audit';
import {
  CellValue,
  ColumnDef,
  DataType,
  fromStorage,
  normalizeValue,
  toColumnDef,
  toStorage,
  valuesEqual,
} from '../shared/cellValue';
import { badRequest, reqMeta } from '../shared/http';
import { LV, requireSheet } from '../shared/permissions';
import { emitToSheet } from '../socket';

export async function loadColumns(sheetId: string, tx?: Tx | null, includeDeleted = false) {
  return q(
    `SELECT * FROM Columns WHERE sheet_id = @s ${includeDeleted ? '' : 'AND is_deleted = 0'}
     ORDER BY display_order, created_at`,
    { s: sheetId },
    tx,
  );
}

export interface WriteArgs {
  sheetId: string;
  rowId: string;
  col: ColumnDef;
  value: CellValue;
  userId: string;
  source: string;
  /** Type used to read the previous value (differs during a column type conversion) */
  readType?: DataType;
}

export interface WriteResult {
  changed: boolean;
  oldValue: CellValue;
  newValue: CellValue;
  historyId: number | null;
  at: Date | null;
}

/** Upserts one cell and appends a CellHistory version. Must run inside a transaction. */
export async function writeCell(tx: Tx, a: WriteArgs): Promise<WriteResult> {
  const existing = await q1(
    `SELECT cell_id, value_text, value_int, value_float, value_date, value_bool, value_json
     FROM Cells WITH (UPDLOCK, HOLDLOCK) WHERE row_id = @r AND column_id = @c`,
    { r: T.uuid(a.rowId), c: T.uuid(a.col.column_id) },
    tx,
  );
  const oldValue = existing ? fromStorage(a.readType ?? a.col.data_type, existing) : null;
  const typeChanged = !!a.readType && a.readType !== a.col.data_type;
  if (!typeChanged && valuesEqual(oldValue, a.value)) {
    return { changed: false, oldValue, newValue: a.value, historyId: null, at: null };
  }
  if (!existing && a.value === null) {
    return { changed: false, oldValue, newValue: null, historyId: null, at: null };
  }

  const st = toStorage(a.col.data_type, a.value);
  const p = {
    r: T.uuid(a.rowId),
    c: T.uuid(a.col.column_id),
    u: T.uuid(a.userId),
    vt: T.text(st.value_text),
    vi: T.bigint(st.value_int),
    vf: T.float(st.value_float),
    vd: T.dt(st.value_date),
    vb: T.bit(st.value_bool),
    vj: T.text(st.value_json),
  };

  let cellId: string;
  if (existing) {
    cellId = existing.cell_id;
    await q(
      `UPDATE Cells SET value_text = @vt, value_int = @vi, value_float = @vf, value_date = @vd, value_bool = @vb,
         value_json = @vj, updated_by = @u, updated_at = SYSUTCDATETIME()
       WHERE cell_id = @id`,
      { ...p, id: T.uuid(cellId) },
      tx,
    );
  } else {
    const ins = await q1(
      `INSERT INTO Cells (row_id, column_id, value_text, value_int, value_float, value_date, value_bool, value_json, updated_by)
       OUTPUT inserted.cell_id
       VALUES (@r, @c, @vt, @vi, @vf, @vd, @vb, @vj, @u)`,
      p,
      tx,
    );
    cellId = ins!.cell_id;
  }

  const h = await q1(
    `INSERT INTO CellHistory (cell_id, sheet_id, row_id, column_id, old_value, new_value, change_source, changed_by, version_number)
     OUTPUT inserted.history_id, inserted.changed_at
     SELECT @cell, @s, @r, @c, @ov, @nv, @src, @u, ISNULL(MAX(version_number), 0) + 1
     FROM CellHistory WHERE cell_id = @cell`,
    {
      cell: T.uuid(cellId),
      s: T.uuid(a.sheetId),
      r: T.uuid(a.rowId),
      c: T.uuid(a.col.column_id),
      ov: T.text(existing ? JSON.stringify(oldValue) : null),
      nv: T.text(JSON.stringify(a.value)),
      src: a.source,
      u: T.uuid(a.userId),
    },
    tx,
  );
  await q(
    `UPDATE Rows SET updated_at = SYSUTCDATETIME(), updated_by = @u WHERE row_id = @r`,
    { r: T.uuid(a.rowId), u: T.uuid(a.userId) },
    tx,
  );
  return { changed: true, oldValue, newValue: a.value, historyId: Number(h!.history_id), at: h!.changed_at };
}

export interface CellUpdate {
  rowId: string;
  columnId: string;
  value?: unknown;
}

export interface CellError {
  rowId: string;
  columnId: string;
  rowNo?: number;
  columnName?: string;
  message: string;
}

export interface ApplyOptions {
  req?: Request;
  source?: string;
  /** Apply valid cells and report invalid ones instead of rejecting the batch */
  partial?: boolean;
  skipRequired?: boolean;
  minLevel?: number;
  auditAction?: string;
}

/** Validates + writes a batch of cell updates in one transaction, audits, and broadcasts. */
export async function applyCellUpdates(user: AuthUser, sheetId: string, updates: CellUpdate[], opts: ApplyOptions = {}) {
  if (updates.length > 5000) throw badRequest('อัปเดตได้สูงสุด 5,000 เซลล์ต่อครั้ง');
  const { sheet } = await requireSheet(user, sheetId, opts.minLevel ?? LV.write);
  const cols = await loadColumns(sheetId);
  const colMap = new Map(cols.map((c) => [c.column_id, toColumnDef(c)]));
  const rowIds = [...new Set(updates.map((u) => u.rowId.toLowerCase()))];
  const rows = rowIds.length
    ? await q(
        `SELECT row_id, row_order FROM Rows WHERE sheet_id = @s AND is_deleted = 0 AND row_id IN ${idList('@ids')}`,
        { s: T.uuid(sheetId), ids: jsonParam(rowIds) },
      )
    : [];
  const rowMap = new Map(rows.map((r) => [r.row_id, r]));

  const errors: CellError[] = [];
  const valid: { rowId: string; col: ColumnDef; rowNo: number; value: CellValue }[] = [];
  const seen = new Set<string>();
  for (const u of updates) {
    const rowId = u.rowId.toLowerCase();
    const columnId = u.columnId.toLowerCase();
    const col = colMap.get(columnId);
    const row = rowMap.get(rowId);
    if (!col) {
      errors.push({ rowId, columnId, message: 'ไม่พบคอลัมน์ (อาจถูกลบแล้ว)' });
      continue;
    }
    if (!row) {
      errors.push({ rowId, columnId, columnName: col.column_name, message: 'ไม่พบแถว (อาจถูกลบแล้ว)' });
      continue;
    }
    const n = normalizeValue(col, u.value, { skipRequired: opts.skipRequired });
    if (!n.ok) {
      errors.push({ rowId, columnId, rowNo: row.row_order, columnName: col.column_name, message: n.error });
      continue;
    }
    const key = `${rowId}:${columnId}`;
    if (seen.has(key)) {
      const idx = valid.findIndex((v) => v.rowId === rowId && v.col.column_id === columnId);
      if (idx >= 0) valid.splice(idx, 1);
    }
    seen.add(key);
    valid.push({ rowId, col, rowNo: row.row_order, value: n.value });
  }
  if (errors.length && !opts.partial) {
    throw badRequest(errors.length === 1 ? errors[0].message : `ข้อมูลไม่ถูกต้อง ${errors.length} เซลล์: ${errors[0].message}`, {
      cells: errors,
    });
  }

  const source = opts.source ?? 'edit';
  const written = await withTx(async (tx) => {
    const out: {
      rowId: string;
      columnId: string;
      rowNo: number;
      columnName: string;
      oldValue: CellValue;
      newValue: CellValue;
      historyId: number | null;
      at: Date | null;
    }[] = [];
    for (const v of valid) {
      const r = await writeCell(tx, { sheetId, rowId: v.rowId, col: v.col, value: v.value, userId: user.id, source });
      if (r.changed)
        out.push({
          rowId: v.rowId,
          columnId: v.col.column_id,
          rowNo: v.rowNo,
          columnName: v.col.column_name,
          oldValue: r.oldValue,
          newValue: r.newValue,
          historyId: r.historyId,
          at: r.at,
        });
    }
    await auditMany(
      out.map((w) => ({
        userId: user.id,
        action: opts.auditAction ?? 'cell_update',
        entityType: 'cell',
        entityId: `${w.rowId}:${w.columnId}`,
        fileId: sheet.file_id,
        sheetId,
        oldValue: { value: w.oldValue },
        newValue: { value: w.newValue, columnName: w.columnName, rowNo: w.rowNo, historyId: w.historyId, source },
      })),
      opts.req,
      tx,
    );
    return out;
  });

  if (written.length) {
    emitToSheet(
      sheetId,
      'cells:updated',
      {
        sheetId,
        updates: written.map((w) => ({
          rowId: w.rowId,
          columnId: w.columnId,
          value: w.newValue,
          by: user.id,
          byName: user.displayName,
          at: w.at,
        })),
      },
      reqMeta(opts.req).socketId,
    );
  }
  return {
    updated: written.map((w) => ({ rowId: w.rowId, columnId: w.columnId, value: w.newValue, at: w.at, by: user.id })),
    unchanged: valid.length - written.length,
    errors,
  };
}
