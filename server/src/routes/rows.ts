import { Router } from 'express';
import { z } from 'zod';
import { idList, jsonParam, q, q1, T, withTx } from '../config/db';
import { audit, auditMany } from '../shared/audit';
import { CellValue, normalizeValue, toColumnDef } from '../shared/cellValue';
import { ah, badRequest, forbidden, notFound, ok, parse, pid, reqMeta, safeJson, zId } from '../shared/http';
import { LV, requireSheet } from '../shared/permissions';
import { filterSchema, sortSchema } from '../shared/schemas';
import { loadColumns, writeCell } from '../services/cellWriter';
import { applyRollback, planRollback } from '../services/rollback';
import { distinctValues, hydrateRows, queryRows, userNames } from '../services/rowQuery';
import { emitToSheet } from '../socket';

const router = Router();

const querySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(1000).default(100),
  sorts: z.array(sortSchema).max(5).default([]),
  filters: z.array(filterSchema).max(50).default([]),
  search: z.string().max(200).optional(),
});

router.post(
  '/sheets/:id/rows/query',
  ah(async (req, res) => {
    const sheetId = pid(req);
    await requireSheet(req.user!, sheetId, LV.read);
    const body = parse(querySchema, req.body ?? {});
    const cols = await loadColumns(sheetId);
    ok(res, await queryRows(sheetId, cols, body));
  }),
);

router.post(
  '/sheets/:id/distinct',
  ah(async (req, res) => {
    const sheetId = pid(req);
    await requireSheet(req.user!, sheetId, LV.read);
    const body = parse(
      z.object({
        columnId: zId,
        filters: z.array(filterSchema).max(50).default([]),
        search: z.string().max(200).optional(),
        valueSearch: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(2000).default(500),
      }),
      req.body,
    );
    const cols = await loadColumns(sheetId);
    ok(res, await distinctValues(sheetId, cols, body.columnId, body));
  }),
);

router.post(
  '/sheets/:id/rows',
  ah(async (req, res) => {
    const sheetId = pid(req);
    const u = req.user!;
    const { sheet } = await requireSheet(u, sheetId, LV.write);
    const { values } = parse(z.object({ values: z.record(z.any()).default({}) }), req.body);
    const cols = await loadColumns(sheetId);
    const lowered = Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
    const fieldErrors: Record<string, string> = {};
    const toWrite: { col: ReturnType<typeof toColumnDef>; value: CellValue }[] = [];
    for (const c of cols) {
      const def = toColumnDef(c);
      const raw = c.column_id in lowered ? lowered[c.column_id] : safeJson(c.default_value, null);
      const n = normalizeValue(def, raw);
      if (!n.ok) fieldErrors[c.column_id] = n.error;
      else if (n.value !== null) toWrite.push({ col: def, value: n.value });
    }
    if (Object.keys(fieldErrors).length)
      throw badRequest(Object.values(fieldErrors)[0], { fields: fieldErrors });

    const rowId = await withTx(async (tx) => {
      const o = await q1(`SELECT ISNULL(MAX(row_order), 0) + 1 AS o FROM Rows WITH (UPDLOCK, HOLDLOCK) WHERE sheet_id = @s`, { s: T.uuid(sheetId) }, tx);
      const r = await q1(
        `INSERT INTO Rows (sheet_id, row_order, created_by, updated_by) OUTPUT inserted.row_id VALUES (@s, @o, @u, @u)`,
        { s: T.uuid(sheetId), o: T.int(o!.o), u: T.uuid(u.id) },
        tx,
      );
      for (const w of toWrite) await writeCell(tx, { sheetId, rowId: r!.row_id, col: w.col, value: w.value, userId: u.id, source: 'create' });
      await audit({ userId: u.id, action: 'row_create', entityType: 'row', entityId: r!.row_id, fileId: sheet.file_id, sheetId,
        newValue: { rowNo: o!.o, values: Object.fromEntries(toWrite.map((w) => [w.col.column_name, w.value])) } }, req, tx);
      return r!.row_id as string;
    });
    const rec = await q(`SELECT * FROM Rows WHERE row_id = @r`, { r: T.uuid(rowId) });
    const { rows, userIds } = await hydrateRows(rec, cols);
    emitToSheet(sheetId, 'rows:changed', { sheetId, action: 'create', rowId, by: u.displayName }, reqMeta(req).socketId);
    ok(res, { row: rows[0], users: await userNames(userIds) }, 201);
  }),
);

async function deleteRows(req: any, sheetId: string, rowIds: string[]) {
  const u = req.user!;
  const { sheet } = await requireSheet(u, sheetId, LV.write);
  const cols = await loadColumns(sheetId);
  const recs = await q(`SELECT * FROM Rows WHERE sheet_id = @s AND is_deleted = 0 AND row_id IN ${idList('@ids')}`,
    { s: T.uuid(sheetId), ids: jsonParam(rowIds) });
  if (!recs.length) throw notFound('ไม่พบแถวที่ต้องการลบ');
  const { rows } = await hydrateRows(recs, cols);
  const names = new Map(cols.map((c) => [c.column_id, c.column_name]));
  await withTx(async (tx) => {
    const snaps = rows.map((r) => ({ row_id: r.id, sheet_id: sheetId, data: JSON.stringify({ rowNo: r.order, values: r.values }) }));
    await q(
      `INSERT INTO RowSnapshots (row_id, sheet_id, snapshot_data, snapshot_type, created_by)
       SELECT row_id, sheet_id, data, N'before_delete', @u FROM OPENJSON(@j) WITH (row_id UNIQUEIDENTIFIER, sheet_id UNIQUEIDENTIFIER, data NVARCHAR(MAX))`,
      { j: T.text(JSON.stringify(snaps)), u: T.uuid(u.id) },
      tx,
    );
    await q(`UPDATE Rows SET is_deleted = 1, deleted_at = SYSUTCDATETIME(), deleted_by = @u WHERE row_id IN ${idList('@ids')}`,
      { u: T.uuid(u.id), ids: jsonParam(rows.map((r) => r.id)) }, tx);
    await auditMany(rows.map((r) => ({
      userId: u.id, action: 'row_delete', entityType: 'row', entityId: r.id, fileId: sheet.file_id, sheetId,
      oldValue: { rowNo: r.order, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [names.get(k) ?? k, v])) },
    })), req, tx);
  });
  emitToSheet(sheetId, 'rows:changed', { sheetId, action: 'delete', rowIds: rows.map((r) => r.id), by: u.displayName }, reqMeta(req).socketId);
  return rows.length;
}

router.delete(
  '/rows/:id',
  ah(async (req, res) => {
    const id = pid(req);
    const r = await q1(`SELECT sheet_id FROM Rows WHERE row_id = @r`, { r: T.uuid(id) });
    if (!r) throw notFound('ไม่พบแถว');
    ok(res, { deleted: await deleteRows(req, r.sheet_id, [id]) });
  }),
);

router.post(
  '/sheets/:id/rows/delete',
  ah(async (req, res) => {
    const sheetId = pid(req);
    const { rowIds } = parse(z.object({ rowIds: z.array(zId).min(1).max(5000) }), req.body);
    ok(res, { deleted: await deleteRows(req, sheetId, rowIds) });
  }),
);

router.get(
  '/sheets/:id/trash',
  ah(async (req, res) => {
    const sheetId = pid(req);
    await requireSheet(req.user!, sheetId, LV.write);
    const cols = await loadColumns(sheetId);
    const recs = await q(`SELECT TOP 500 * FROM Rows WHERE sheet_id = @s AND is_deleted = 1 ORDER BY deleted_at DESC`, { s: T.uuid(sheetId) });
    const { rows, userIds } = await hydrateRows(recs, cols);
    ok(res, { rows, users: await userNames(userIds) });
  }),
);

router.post(
  '/sheets/:id/rows/restore',
  ah(async (req, res) => {
    const sheetId = pid(req);
    const u = req.user!;
    const { sheet } = await requireSheet(u, sheetId, LV.write);
    const { rowIds } = parse(z.object({ rowIds: z.array(zId).min(1).max(5000) }), req.body);
    const restored = await withTx(async (tx) => {
      const rows = await q(
        `UPDATE Rows SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = SYSUTCDATETIME(), updated_by = @u
         OUTPUT inserted.row_id, inserted.row_order
         WHERE sheet_id = @s AND is_deleted = 1 AND row_id IN ${idList('@ids')}`,
        { u: T.uuid(u.id), s: T.uuid(sheetId), ids: jsonParam(rowIds) },
        tx,
      );
      await auditMany(rows.map((r) => ({ userId: u.id, action: 'row_restore', entityType: 'row', entityId: r.row_id, fileId: sheet.file_id, sheetId,
        newValue: { rowNo: r.row_order } })), req, tx);
      return rows.length;
    });
    emitToSheet(sheetId, 'rows:changed', { sheetId, action: 'restore', by: u.displayName }, reqMeta(req).socketId);
    ok(res, { restored });
  }),
);

router.get(
  '/rows/:id/history',
  ah(async (req, res) => {
    const id = pid(req);
    const r = await q1(`SELECT * FROM Rows WHERE row_id = @r`, { r: T.uuid(id) });
    if (!r) throw notFound('ไม่พบแถว');
    await requireSheet(req.user!, r.sheet_id, LV.read);
    const history = await q(
      `SELECT TOP 500 h.history_id, h.column_id, c.column_name, c.data_type, h.old_value, h.new_value, h.change_source,
         h.changed_by, u.display_name AS changed_by_name, u.avatar_url, h.changed_at, h.version_number
       FROM CellHistory h
       JOIN Columns c ON c.column_id = h.column_id
       JOIN Users u ON u.user_id = h.changed_by
       WHERE h.row_id = @r ORDER BY h.changed_at DESC, h.history_id DESC`,
      { r: T.uuid(id) },
    );
    const snapshots = await q(
      `SELECT TOP 50 s.snapshot_id, s.snapshot_type, s.snapshot_data, s.created_at, u.display_name AS created_by_name
       FROM RowSnapshots s JOIN Users u ON u.user_id = s.created_by WHERE s.row_id = @r ORDER BY s.created_at DESC`,
      { r: T.uuid(id) },
    );
    ok(res, {
      row: { id: r.row_id, order: r.row_order, createdAt: r.created_at, isDeleted: !!r.is_deleted },
      history: history.map((h) => ({
        id: Number(h.history_id), columnId: h.column_id, columnName: h.column_name, dataType: h.data_type,
        oldValue: safeJson(h.old_value, null), newValue: safeJson(h.new_value, null), source: h.change_source,
        by: h.changed_by, byName: h.changed_by_name, avatarUrl: h.avatar_url, at: h.changed_at, version: h.version_number,
      })),
      snapshots: snapshots.map((s) => ({ id: Number(s.snapshot_id), type: s.snapshot_type, data: safeJson(s.snapshot_data, {}), at: s.created_at, byName: s.created_by_name })),
    });
  }),
);

const rollbackBody = z.object({ at: z.string().datetime({ offset: true }), reason: z.string().trim().max(1000).optional(), preview: z.boolean().default(false) });

router.post(
  '/rows/:id/rollback',
  ah(async (req, res) => {
    const id = pid(req);
    const r = await q1(`SELECT sheet_id FROM Rows WHERE row_id = @r`, { r: T.uuid(id) });
    if (!r) throw notFound('ไม่พบแถว');
    const { sheet } = await requireSheet(req.user!, r.sheet_id, LV.manage);
    const body = parse(rollbackBody, req.body);
    const plan = await planRollback(r.sheet_id, new Date(body.at), id);
    if (body.preview) return ok(res, { preview: true, cells: plan.cellChanges.length, rowsToRestore: plan.rowsToRestore.length, rowsToDelete: 0 });
    ok(res, await applyRollback(req.user!, sheet, plan, { req, reason: body.reason, scope: 'row', rowId: id }));
  }),
);

router.post(
  '/sheets/:id/rollback',
  ah(async (req, res) => {
    const sheetId = pid(req);
    if (req.user!.role !== 'admin') throw forbidden('การย้อนข้อมูลทั้งชีตทำได้เฉพาะ Admin');
    const { sheet } = await requireSheet(req.user!, sheetId, LV.manage);
    const body = parse(rollbackBody, req.body);
    const at = new Date(body.at);
    if (at > new Date()) throw badRequest('เวลาที่ต้องการย้อนต้องเป็นอดีต');
    const plan = await planRollback(sheetId, at);
    if (body.preview)
      return ok(res, { preview: true, cells: plan.cellChanges.length, rowsToDelete: plan.rowsToDelete.length, rowsToRestore: plan.rowsToRestore.length });
    if (!body.reason || body.reason.length < 5) throw badRequest('กรุณาระบุเหตุผลในการย้อนข้อมูล (อย่างน้อย 5 ตัวอักษร)');
    ok(res, await applyRollback(req.user!, sheet, plan, { req, reason: body.reason, scope: 'sheet' }));
  }),
);

export default router;
