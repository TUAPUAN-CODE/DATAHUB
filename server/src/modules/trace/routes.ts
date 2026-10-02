import { Router } from 'express';
import { z } from 'zod';
import { idList, jsonParam, q, q1, T } from '../../config/db';
import { fromStorage } from '../../shared/cellValue';
import { ah, badRequest, notFound, ok, parse, pid, zId } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { loadColumns } from '../../services/cellWriter';
import { findRowByValue } from '../../services/rowFind';
import { readSettings } from '../../services/sheetSettings';
import type { AuthUser } from '../../middleware/auth';

const router = Router();
const MAX_NODES = 300;

/** All links reachable from a row in one direction (back = what it was made of / sits in, forward = what was made of it / what sits in it) */
async function walk(rowId: string, dir: 'back' | 'forward', depth: number) {
  const [self, other] = dir === 'back' ? ['child_row_id', 'parent_row_id'] : ['parent_row_id', 'child_row_id'];
  return q(
    `WITH t AS (
       SELECT l.link_id, l.parent_row_id, l.child_row_id, l.qty, l.role, 1 AS lvl,
              CAST(N'/' + CAST(l.${self} AS NVARCHAR(40)) + N'/' + CAST(l.${other} AS NVARCHAR(40)) + N'/' AS NVARCHAR(4000)) AS path
       FROM RowLinks l WHERE l.${self} = @r
       UNION ALL
       SELECT l.link_id, l.parent_row_id, l.child_row_id, l.qty, l.role, t.lvl + 1,
              CAST(t.path + CAST(l.${other} AS NVARCHAR(40)) + N'/' AS NVARCHAR(4000))
       FROM RowLinks l JOIN t ON l.${self} = t.${other}
       WHERE t.lvl < @d AND t.path NOT LIKE N'%/' + CAST(l.${other} AS NVARCHAR(40)) + N'/%'
     )
     SELECT TOP ${MAX_NODES * 2} link_id, parent_row_id, child_row_id, qty, role, lvl FROM t ORDER BY lvl, link_id OPTION (MAXRECURSION 60)`,
    { r: T.uuid(rowId), d: T.int(depth) });
}

const fmtCell = (type: string, row: any) => {
  const v = fromStorage(type as never, row);
  if (v === null || v === '') return '';
  return Array.isArray(v) ? v.join(', ') : String(v);
};

/** The sheet's own idea of "what identifies a row": mix key column, then the key of a scan format, then the first column */
async function labelColumn(sheetId: string, cols: any[]): Promise<string | null> {
  const s = await readSettings(sheetId);
  const id = s.mix?.keyColumnId ?? (s.scanProfiles ?? []).find((p: any) => p.keyColumnId)?.keyColumnId ?? null;
  return id ?? cols[0]?.column_id ?? null;
}

router.post('/sheets/:id/find', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.read);
  const body = parse(z.object({ columnId: zId, value: z.string().trim().min(1).max(500) }), req.body);
  const col = (await loadColumns(sheetId)).find((c) => c.column_id === body.columnId);
  if (!col) throw badRequest('ไม่พบคอลัมน์');
  const f = await findRowByValue(sheetId, col, body.value);
  if (!f) throw notFound(`ไม่พบแถวที่ ${col.column_name} = “${body.value}”`);
  ok(res, { rowId: f.rowId, rowNo: f.rowNo });
}));

/** Traceback of one row, both directions. Rows of sheets the user cannot read are shown as "restricted" (no values). */
router.get('/trace/rows/:rowId', ah(async (req, res) => {
  const u = req.user as AuthUser;
  const rowId = String(req.params.rowId);
  const query = parse(z.object({ dir: z.enum(['back', 'forward', 'both']).default('both'), depth: z.coerce.number().int().min(1).max(12).default(8) }), req.query);
  const start = await q1(`SELECT row_id, sheet_id FROM Rows WHERE row_id = @r AND is_deleted = 0`, { r: T.uuid(rowId) });
  if (!start) throw notFound('ไม่พบแถว');
  await requireSheet(u, start.sheet_id, LV.read);

  const links: { id: number; parent: string; child: string; qty: number | null; role: string; lvl: number; dir: 'back' | 'forward' }[] = [];
  for (const dir of query.dir === 'both' ? (['back', 'forward'] as const) : [query.dir]) {
    for (const r of await walk(rowId, dir, query.depth)) links.push({ id: Number(r.link_id), parent: String(r.parent_row_id).toLowerCase(), child: String(r.child_row_id).toLowerCase(), qty: r.qty ?? null, role: r.role, lvl: Number(r.lvl), dir });
  }
  const ids = [...new Set([rowId.toLowerCase(), ...links.flatMap((l) => [l.parent, l.child])])].slice(0, MAX_NODES);
  const rows = await q(
    `SELECT r.row_id, r.row_order, r.sheet_id, r.created_at, sh.sheet_name, f.file_id, f.file_name
     FROM Rows r JOIN Sheets sh ON sh.sheet_id = r.sheet_id JOIN Files f ON f.file_id = sh.file_id
     WHERE r.row_id IN ${idList('@ids')}`, { ids: jsonParam(ids) });

  // per sheet: may the user read it, and which columns identify / summarise a row
  const sheetInfo = new Map<string, { readable: boolean; cols: any[]; label: string | null; show: any[] }>();
  for (const sid of new Set(rows.map((r) => String(r.sheet_id).toLowerCase()))) {
    let readable = true;
    try { await requireSheet(u, sid, LV.read); } catch { readable = false; }
    if (!readable) { sheetInfo.set(sid, { readable, cols: [], label: null, show: [] }); continue; }
    const cols = await loadColumns(sid);
    const label = await labelColumn(sid, cols);
    const show = cols.filter((c) => c.column_id !== label && !['image', 'multi_select'].includes(c.data_type)).slice(0, 5);
    sheetInfo.set(sid, { readable, cols, label, show });
  }
  const values = new Map<string, Map<string, any>>();
  for (const [sid, info] of sheetInfo) {
    if (!info.readable) continue;
    const want = [info.label, ...info.show.map((c) => c.column_id)].filter(Boolean) as string[];
    const rowIds = rows.filter((r) => String(r.sheet_id).toLowerCase() === sid).map((r) => String(r.row_id).toLowerCase());
    if (!want.length || !rowIds.length) continue;
    const cells = await q(`SELECT row_id, column_id, value_text, value_int, value_float, value_date, value_bool, value_json FROM Cells WHERE row_id IN ${idList('@ids')} AND column_id IN ${idList('@cc')}`, { ids: jsonParam(rowIds), cc: jsonParam(want) });
    for (const c of cells) { const k = String(c.row_id).toLowerCase(); if (!values.has(k)) values.set(k, new Map()); values.get(k)!.set(String(c.column_id).toLowerCase(), c); }
  }

  const nodes = rows.map((r) => {
    const rid = String(r.row_id).toLowerCase();
    const info = sheetInfo.get(String(r.sheet_id).toLowerCase())!;
    const base = { rowId: rid, rowNo: Number(r.row_order), sheetId: String(r.sheet_id).toLowerCase(), sheetName: r.sheet_name, fileId: String(r.file_id).toLowerCase(), fileName: r.file_name, createdAt: r.created_at };
    if (!info.readable) return { ...base, restricted: true, label: null, fields: [] };
    const cell = (colId: string | null) => (colId ? values.get(rid)?.get(colId.toLowerCase()) : undefined);
    const lc = info.cols.find((c) => c.column_id === info.label);
    return {
      ...base, restricted: false,
      label: lc && cell(info.label) ? fmtCell(lc.data_type, cell(info.label)) : null,
      fields: info.show.map((c) => ({ name: c.column_name, type: c.data_type, value: cell(c.column_id) ? fmtCell(c.data_type, cell(c.column_id)) : '' })).filter((f) => f.value !== ''),
    };
  });
  ok(res, { startRowId: rowId.toLowerCase(), nodes, links, truncated: ids.length >= MAX_NODES });
}));

export default router;
