import { Router } from 'express';
import { z } from 'zod';
import { idList, jsonParam, q, T, withTx } from '../../config/db';
import { audit } from '../../shared/audit';
import { fromStorage, toColumnDef } from '../../shared/cellValue';
import { ah, badRequest, ok, parse, pid, reqMeta, zId } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { loadColumns, writeCell } from '../../services/cellWriter';
import { runAfterCellsWritten } from '../../services/hooks';
import { createRowTx } from '../../services/rowCreate';
import { findRowByValue } from '../../services/rowFind';
import { hydrateRows, userNames } from '../../services/rowQuery';
import { readSettings, writeSettingsKey } from '../../services/sheetSettings';
import { emitToSheet } from '../../socket';
import { cut, firstMismatch, MixCfg, sumQty } from './logic';

const router = Router();

const cfgSchema = z.object({
  deductColumnId: zId,
  keyColumnId: zId.nullish(),
  inheritColumnIds: z.array(zId).max(40).nullish(),
  sameColumnIds: z.array(zId).max(10).nullish(),
});

async function mixCfg(sheetId: string): Promise<MixCfg> {
  const c = (await readSettings(sheetId)).mix as MixCfg | undefined;
  if (!c?.deductColumnId) throw badRequest('ชีตนี้ยังไม่ได้ตั้งค่าการผสม (ผู้จัดการเลือกคอลัมน์ที่จะตัดน้ำหนักได้ที่ปุ่ม ตั้งค่าสแกน/ผสม)');
  return c;
}

router.put('/sheets/:id/mix/settings', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.manage);
  const body = parse(z.object({ mix: cfgSchema.nullable() }), req.body);
  if (body.mix) {
    const cols = new Map((await loadColumns(sheetId)).map((c) => [c.column_id, c]));
    const d = cols.get(body.mix.deductColumnId);
    if (!d || !['int', 'float'].includes(d.data_type)) throw badRequest('คอลัมน์ที่ตัดต้องเป็นชนิดตัวเลข (จำนวนเต็ม/ทศนิยม)');
    for (const id of [body.mix.keyColumnId, ...(body.mix.inheritColumnIds ?? []), ...(body.mix.sameColumnIds ?? [])]) if (id && !cols.has(id)) throw badRequest('ไม่พบคอลัมน์ที่เลือก (อาจถูกลบแล้ว)');
  }
  await writeSettingsKey(sheetId, 'mix', body.mix);
  ok(res, { saved: true });
}));

/** Find the row to mix by scanning / typing its key (e.g. mapping_id) */
router.get('/sheets/:id/mix/find', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.write);
  const cfg = await mixCfg(sheetId);
  const value = String(req.query.value ?? '').trim();
  if (!cfg.keyColumnId) throw badRequest('ยังไม่ได้เลือกคอลัมน์ที่ใช้ค้นหาแถว (เช่น mapping_id) ในการตั้งค่าการผสม');
  if (!value) throw badRequest('กรุณาสแกนหรือพิมพ์ค่าที่ใช้ค้นหา');
  const cols = await loadColumns(sheetId);
  const key = cols.find((c) => c.column_id === cfg.keyColumnId);
  const found = key ? await findRowByValue(sheetId, key, value) : null;
  if (!found) throw badRequest(`ไม่พบแถวที่ ${key?.column_name ?? 'คีย์'} = “${value}”`, { notFound: true });
  const rec = await q(`SELECT row_id, row_order, created_by, created_at, updated_by, updated_at, deleted_at, deleted_by FROM Rows WHERE row_id = @r`, { r: T.uuid(found.rowId) });
  const { rows, userIds } = await hydrateRows(rec, cols);
  ok(res, { row: rows[0], users: await userNames(userIds) });
}));

/** One level of links of a row: what it was made from, and what was made from it */
router.get('/sheets/:id/rows/:rowId/links', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.read);
  const rowId = String(req.params.rowId);
  const link = (otherCol: 'parent_row_id' | 'child_row_id', selfCol: 'parent_row_id' | 'child_row_id') => q(
    `SELECT l.link_id, l.${otherCol} AS other_row_id, l.qty, l.role, l.created_at, r.row_order, r.sheet_id
     FROM RowLinks l JOIN Rows r ON r.row_id = l.${otherCol} WHERE l.${selfCol} = @r ORDER BY l.link_id`, { r: T.uuid(rowId) });
  const map = (x: any) => ({ rowId: x.other_row_id, rowNo: x.row_order, sheetId: x.sheet_id, qty: x.qty, role: x.role, at: x.created_at });
  ok(res, { madeFrom: (await link('parent_row_id', 'child_row_id')).map(map), usedIn: (await link('child_row_id', 'parent_row_id')).map(map) });
}));

/** Mix: cut the amounts from the chosen rows and make one new lot (new auto number) — all or nothing */
router.post('/sheets/:id/mix', ah(async (req, res) => {
  const sheetId = pid(req);
  const u = req.user!;
  const { sheet } = await requireSheet(u, sheetId, LV.write);
  const cfg = await mixCfg(sheetId);
  const body = parse(z.object({
    inputs: z.array(z.object({ rowId: zId, qty: z.number().positive().max(1e12) })).min(1).max(100),
    values: z.record(z.any()).default({}),
    outputQty: z.number().positive().max(1e12).nullish(),
  }), req.body);
  if (new Set(body.inputs.map((i) => i.rowId.toLowerCase())).size !== body.inputs.length) throw badRequest('เลือกแถวเดียวกันซ้ำ รวมจำนวนเป็นรายการเดียว');

  const cols = await loadColumns(sheetId);
  const colMap = new Map(cols.map((c) => [c.column_id, c]));
  const deduct = colMap.get(cfg.deductColumnId);
  if (!deduct) throw badRequest('คอลัมน์ที่ตัดน้ำหนักถูกลบไปแล้ว ตั้งค่าการผสมใหม่');
  const deductDef = toColumnDef(deduct);
  const integer = deduct.data_type === 'int';
  const watched = [...new Set([cfg.deductColumnId, ...(cfg.inheritColumnIds ?? []), ...(cfg.sameColumnIds ?? [])])];

  const result = await withTx(async (tx) => {
    const ids = body.inputs.map((i) => i.rowId.toLowerCase());
    const rows = await q(`SELECT row_id, row_order FROM Rows WITH (UPDLOCK) WHERE sheet_id = @s AND is_deleted = 0 AND row_id IN ${idList('@ids')}`, { s: T.uuid(sheetId), ids: jsonParam(ids) }, tx);
    const rowNo = new Map(rows.map((r) => [String(r.row_id).toLowerCase(), Number(r.row_order)]));
    for (const i of ids) if (!rowNo.has(i)) throw badRequest('มีแถวที่เลือกถูกลบไปแล้ว กรุณาโหลดหน้าใหม่');
    const cells = await q(
      `SELECT row_id, column_id, value_text, value_int, value_float, value_date, value_bool, value_json FROM Cells WITH (UPDLOCK, HOLDLOCK)
       WHERE row_id IN ${idList('@ids')} AND column_id IN ${idList('@cc')}`, { ids: jsonParam(ids), cc: jsonParam(watched) }, tx);
    const byRow = new Map<string, Record<string, any>>();
    for (const c of cells) {
      const k = String(c.row_id).toLowerCase();
      if (!byRow.has(k)) byRow.set(k, {});
      byRow.get(k)![String(c.column_id).toLowerCase()] = fromStorage(colMap.get(c.column_id).data_type, c);
    }
    const inputVals = ids.map((i) => byRow.get(i) ?? {});
    if (cfg.sameColumnIds?.length) {
      const bad = firstMismatch(inputVals, cfg.sameColumnIds.map((x) => x.toLowerCase()));
      if (bad) throw badRequest(`ผสมไม่ได้: “${colMap.get(bad)?.column_name ?? ''}” ของแถวที่เลือกไม่ตรงกัน`);
    }
    // cut
    const remaining: { rowId: string; remaining: number }[] = [];
    for (let k = 0; k < body.inputs.length; k++) {
      const id = ids[k];
      let next: number;
      try { next = cut(inputVals[k][cfg.deductColumnId.toLowerCase()] ?? null, body.inputs[k].qty, rowNo.get(id)!, integer); } catch (e) { throw badRequest((e as Error).message); }
      await writeCell(tx, { sheetId, rowId: id, col: deductDef, value: next, userId: u.id, source: 'mix' });
      remaining.push({ rowId: id, remaining: next });
    }
    // new lot
    const total = body.outputQty ?? sumQty(body.inputs.map((i) => i.qty));
    const values: Record<string, unknown> = {};
    for (const cid of cfg.inheritColumnIds ?? []) { const v = inputVals[0][cid.toLowerCase()]; if (v !== undefined && v !== null) values[cid] = v; }
    Object.assign(values, body.values);
    values[cfg.deductColumnId] = total;
    const made = await createRowTx(tx, u, sheet, sheetId, values, 'mix', req);
    for (const i of body.inputs) {
      await q(`INSERT INTO RowLinks (sheet_id, parent_row_id, child_row_id, qty, role, created_by) VALUES (@s, @p, @c, @q, N'mix_input', @u)`,
        { s: T.uuid(sheetId), p: T.uuid(i.rowId), c: T.uuid(made.rowId), q: T.float(i.qty), u: T.uuid(u.id) }, tx);
    }
    await runAfterCellsWritten({ tx, user: u, sheetId, rowIds: ids, source: 'mix' });
    await audit({ userId: u.id, action: 'row_mix', entityType: 'row', entityId: made.rowId, fileId: sheet.file_id, sheetId,
      newValue: { rowNo: made.rowNo, inputs: body.inputs.map((i) => ({ rowNo: rowNo.get(i.rowId.toLowerCase()), qty: i.qty })), total } }, req, tx);
    return { ...made, remaining, total };
  });
  emitToSheet(sheetId, 'rows:changed', { sheetId, action: 'mix', rowId: result.rowId, by: u.displayName }, reqMeta(req).socketId);
  const rec = await q(`SELECT row_id, row_order, created_by, created_at, updated_by, updated_at, deleted_at, deleted_by FROM Rows WHERE row_id = @r`, { r: T.uuid(result.rowId) });
  const { rows, userIds } = await hydrateRows(rec, cols);
  ok(res, { row: rows[0], rowNo: result.rowNo, total: result.total, remaining: result.remaining, users: await userNames(userIds) }, 201);
}));

export default router;
