import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../config/db';
import { ah, badRequest, notFound, ok, parse, pid, safeJson, zId } from '../shared/http';
import { LV, requireSheet } from '../shared/permissions';
import { applyCellUpdates } from '../services/cellWriter';

const router = Router();

router.put(
  '/rows/:rowId/cells/:columnId',
  ah(async (req, res) => {
    const rowId = pid(req, 'rowId');
    const columnId = pid(req, 'columnId');
    const { value } = parse(z.object({ value: z.any() }), req.body);
    const row = await q1(`SELECT sheet_id FROM Rows WHERE row_id = @r AND is_deleted = 0`, { r: T.uuid(rowId) });
    if (!row) throw notFound('ไม่พบแถว (อาจถูกลบแล้ว)');
    const result = await applyCellUpdates(req.user!, row.sheet_id, [{ rowId, columnId, value }], { req });
    const mine = result.updated.find((u) => u.rowId === rowId && u.columnId === columnId);
    // `derived` = cells a module (e.g. formula columns) recalculated because of this edit
    const derived = result.updated.filter((u) => u !== mine);
    ok(res, { ...(mine ?? { rowId, columnId, unchanged: true }), ...(derived.length ? { derived } : {}) });
  }),
);

router.post(
  '/sheets/:id/cells/bulk',
  ah(async (req, res) => {
    const sheetId = pid(req);
    const body = parse(
      z.object({
        updates: z.array(z.object({ rowId: zId, columnId: zId, value: z.any() })).min(1).max(5000),
        partial: z.boolean().default(false),
        source: z.enum(['edit', 'paste', 'undo', 'fill']).default('edit'),
      }),
      req.body,
    );
    ok(res, await applyCellUpdates(req.user!, sheetId, body.updates, { req, partial: body.partial, source: body.source }));
  }),
);

router.get(
  '/cells/history',
  ah(async (req, res) => {
    const { rowId, columnId } = parse(z.object({ rowId: zId, columnId: zId }), req.query);
    const row = await q1(`SELECT sheet_id, row_order FROM Rows WHERE row_id = @r`, { r: T.uuid(rowId) });
    if (!row) throw notFound('ไม่พบแถว');
    const { level } = await requireSheet(req.user!, row.sheet_id, LV.read);
    const col = await q1(`SELECT column_name, data_type, select_options FROM Columns WHERE column_id = @c`, { c: T.uuid(columnId) });
    const rows = await q(
      `SELECT TOP 200 h.history_id, h.old_value, h.new_value, h.change_source, h.changed_by, u.display_name, u.avatar_url,
         h.changed_at, h.version_number
       FROM CellHistory h JOIN Users u ON u.user_id = h.changed_by
       WHERE h.row_id = @r AND h.column_id = @c ORDER BY h.history_id DESC`,
      { r: T.uuid(rowId), c: T.uuid(columnId) },
    );
    ok(res, {
      column: col ? { name: col.column_name, dataType: col.data_type, options: safeJson(col.select_options, []) } : null,
      rowNo: row.row_order,
      canRollback: level >= LV.manage,
      versions: rows.map((h) => ({
        id: Number(h.history_id), oldValue: safeJson(h.old_value, null), newValue: safeJson(h.new_value, null),
        source: h.change_source, by: h.changed_by, byName: h.display_name, avatarUrl: h.avatar_url, at: h.changed_at, version: h.version_number,
      })),
    });
  }),
);

router.post(
  '/cells/rollback',
  ah(async (req, res) => {
    const { historyId, target } = parse(z.object({ historyId: z.number().int().positive(), target: z.enum(['new', 'old']).default('new') }), req.body);
    const h = await q1(`SELECT h.*, r.is_deleted AS row_deleted FROM CellHistory h JOIN Rows r ON r.row_id = h.row_id WHERE h.history_id = @h`, { h: T.bigint(historyId) });
    if (!h) throw notFound('ไม่พบประวัติเวอร์ชันนี้');
    if (h.row_deleted) throw badRequest('แถวนี้ถูกลบแล้ว กรุณากู้คืนแถวก่อน');
    const value = safeJson(target === 'new' ? h.new_value : h.old_value, null);
    const result = await applyCellUpdates(req.user!, h.sheet_id, [{ rowId: h.row_id, columnId: h.column_id, value }], {
      req, source: 'rollback', skipRequired: true, minLevel: LV.manage, auditAction: 'cell_rollback',
    });
    ok(res, result.updated[0] ?? { rowId: h.row_id, columnId: h.column_id, value, unchanged: true });
  }),
);

export default router;
