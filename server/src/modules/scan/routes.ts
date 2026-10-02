import { Router } from 'express';
import { z } from 'zod';
import { q, T, withTx } from '../../config/db';
import { applyCellUpdates, loadColumns } from '../../services/cellWriter';
import { createRowTx } from '../../services/rowCreate';
import { findRowByValue } from '../../services/rowFind';
import { hydrateRows, userNames } from '../../services/rowQuery';
import { readSettings, writeSettingsKey } from '../../services/sheetSettings';
import { emitToSheet } from '../../socket';
import { ah, badRequest, ok, parse, pid, reqMeta, zId } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { detectProfile, parseScan, ScanProfile } from './parse';

const router = Router();

const profileSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  delimiter: z.string().max(5),
  match: z.object({ prefix: z.string().max(60).nullish(), regex: z.string().max(300).nullish(), fieldCount: z.number().int().min(1).max(50).nullish() }).nullish(),
  fields: z.array(z.object({ index: z.number().int().min(1).max(50), columnId: zId })).min(1).max(50),
  action: z.enum(['create', 'update']),
  keyColumnId: zId.nullish(),
  onMiss: z.enum(['create', 'reject']).nullish(),
});

const loadProfiles = async (sheetId: string): Promise<ScanProfile[]> => ((await readSettings(sheetId)).scanProfiles ?? []) as ScanProfile[];

/** Managers: save the QR formats of this sheet */
router.put('/sheets/:id/scan/profiles', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.manage);
  const { profiles } = parse(z.object({ profiles: z.array(profileSchema).max(20) }), req.body);
  const cols = new Set((await loadColumns(sheetId)).map((c) => c.column_id));
  for (const p of profiles) {
    for (const f of p.fields) if (!cols.has(f.columnId)) throw badRequest(`รูปแบบ “${p.name}”: ไม่พบคอลัมน์ที่เลือก (อาจถูกลบแล้ว)`);
    if (new Set(p.fields.map((f) => f.index)).size !== p.fields.length) throw badRequest(`รูปแบบ “${p.name}”: ข้อมูลชุดเดียวกันถูกใส่หลายคอลัมน์`);
    if (p.action === 'update' && (!p.keyColumnId || !p.fields.some((f) => f.columnId === p.keyColumnId))) throw badRequest(`รูปแบบ “${p.name}”: โหมดอัปเดตต้องเลือกคอลัมน์ที่ใช้หาแถว และคอลัมน์นั้นต้องมีข้อมูลชุดที่ใส่ให้`);
    if (p.match?.regex) { try { new RegExp(p.match.regex); } catch { throw badRequest(`รูปแบบ “${p.name}”: เงื่อนไข regex ไม่ถูกต้อง`); } }
  }
  await writeSettingsKey(sheetId, 'scanProfiles', profiles.length ? profiles : null);
  ok(res, { saved: true });
}));

/** Shows how a text would be split (editor "try it" box) — nothing is written */
router.post('/sheets/:id/scan/preview', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.read);
  const body = parse(z.object({ text: z.string().min(1).max(2000), profile: profileSchema.optional() }), req.body);
  const profile = body.profile ?? detectProfile(body.text, await loadProfiles(sheetId));
  if (!profile) return ok(res, { profile: null, pieces: [], values: {} });
  ok(res, { profile: { id: profile.id, name: profile.name }, ...parseScan(body.text, profile as ScanProfile) });
}));

/** A scan: pick the format, split the text and create a row / update the row it identifies */
router.post('/sheets/:id/scan', ah(async (req, res) => {
  const sheetId = pid(req);
  const u = req.user!;
  const { sheet } = await requireSheet(u, sheetId, LV.write);
  const body = parse(z.object({ text: z.string().min(1).max(2000), profileId: z.string().max(40).nullish() }), req.body);
  const profiles = await loadProfiles(sheetId);
  if (!profiles.length) throw badRequest('ชีตนี้ยังไม่ได้ตั้งค่ารูปแบบ QR (ผู้จัดการตั้งได้ที่ปุ่ม ตั้งค่าสแกน/ผสม)');
  const profile = body.profileId ? profiles.find((p) => p.id === body.profileId) ?? null : detectProfile(body.text, profiles);
  if (!profile) throw badRequest('ข้อความที่สแกนไม่ตรงกับรูปแบบ QR ที่ตั้งไว้', { text: body.text.slice(0, 200) });
  const { values } = parseScan(body.text, profile);
  if (!Object.keys(values).length) throw badRequest(`รูปแบบ “${profile.name}”: ไม่พบข้อมูลในตำแหน่งที่กำหนด`);

  const cols = await loadColumns(sheetId);
  let rowId: string; let rowNo: number; let action: 'created' | 'updated';
  const found = profile.action === 'update' && profile.keyColumnId && values[profile.keyColumnId]
    ? await findRowByValue(sheetId, cols.find((c) => c.column_id === profile.keyColumnId)!, values[profile.keyColumnId]) : null;
  if (profile.action === 'update' && !found && profile.onMiss !== 'create') {
    const keyName = cols.find((c) => c.column_id === profile.keyColumnId)?.column_name ?? 'คีย์';
    throw badRequest(`ไม่พบแถวที่ ${keyName} = “${values[profile.keyColumnId!] ?? ''}”`, { notFound: true });
  }
  if (found) {
    const updates = Object.entries(values).filter(([c]) => c !== profile.keyColumnId).map(([columnId, value]) => ({ rowId: found.rowId, columnId, value }));
    if (updates.length) await applyCellUpdates(u, sheetId, updates, { req, source: 'scan' });
    rowId = found.rowId; rowNo = found.rowNo; action = 'updated';
  } else {
    const made = await withTx((tx) => createRowTx(tx, u, sheet, sheetId, values, 'scan', req));
    rowId = made.rowId; rowNo = made.rowNo; action = 'created';
    emitToSheet(sheetId, 'rows:changed', { sheetId, action: 'create', rowId, by: u.displayName }, reqMeta(req).socketId);
  }
  const rec = await q(`SELECT row_id, row_order, created_by, created_at, updated_by, updated_at, deleted_at, deleted_by FROM Rows WHERE row_id = @r`, { r: T.uuid(rowId) });
  const { rows, userIds } = await hydrateRows(rec, cols);
  ok(res, { action, rowNo, profile: { id: profile.id, name: profile.name }, row: rows[0], users: await userNames(userIds) });
}));

export default router;
