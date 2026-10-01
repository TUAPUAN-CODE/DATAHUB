import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T, withTx } from '../config/db';
import { isBasicRole } from '../middleware/auth';
import { audit } from '../shared/audit';
import { ah, conflict, forbidden, ok, parse, pid, zColor, zId } from '../shared/http';
import { LV, requireFile, requireFolder, requireSheet } from '../shared/permissions';
import { assertUnionSources, createUnionSheet, readUnionConfig, syncUnion } from '../services/union';

const router = Router();
const sourcesSchema = z.array(zId).min(1).max(50);

/** New file whose only sheet gathers the rows of several sheets with identical columns */
router.post(
  '/union/files',
  ah(async (req, res) => {
    const u = req.user!;
    if (isBasicRole(u.role)) throw forbidden('เฉพาะ Master หรือ Admin เท่านั้นที่สร้างไฟล์ได้');
    const body = parse(z.object({ name: z.string().trim().min(1).max(300), folderId: zId, sources: sourcesSchema, color: zColor.nullish(), description: z.string().max(1000).nullish() }), req.body);
    await requireFolder(u, body.folderId, LV.write);
    const infos = await assertUnionSources(u, body.sources);
    const out = await withTx(async (tx) => {
      const f = await q1(
        `INSERT INTO Files (file_name, folder_id, description, color, icon, created_by) OUTPUT inserted.file_id
         VALUES (@n, @fo, @d, COALESCE(@c, N'#0EA5E9'), N'sheet', @u)`,
        { n: body.name, fo: T.uuid(body.folderId), d: T.text(body.description ?? null), c: T.text(body.color ?? null), u: T.uuid(u.id) }, tx);
      const sheetId = await createUnionSheet(tx, f!.file_id, 'รวมข้อมูล', 0, infos, u.id);
      await audit({ userId: u.id, action: 'file_create', entityType: 'file', entityId: f!.file_id, fileId: f!.file_id,
        newValue: { name: body.name, union: infos.map((i) => i.label) } }, req, tx);
      return { fileId: f!.file_id as string, sheetId };
    });
    await syncUnion(out.sheetId);
    ok(res, { id: out.fileId, sheetId: out.sheetId }, 201);
  }),
);

/** Add a union sheet to an existing file */
router.post(
  '/files/:id/sheets/union',
  ah(async (req, res) => {
    const fileId = pid(req);
    const u = req.user!;
    await requireFile(u, fileId, LV.manage);
    const body = parse(z.object({ name: z.string().trim().min(1).max(200), sources: sourcesSchema }), req.body);
    const dup = await q1(`SELECT 1 AS x FROM Sheets WHERE file_id = @f AND is_deleted = 0 AND sheet_name = @n`, { f: T.uuid(fileId), n: body.name });
    if (dup) throw conflict('มีชีตชื่อนี้อยู่แล้ว');
    const infos = await assertUnionSources(u, body.sources);
    const sheetId = await withTx(async (tx) => {
      const o = await q1(`SELECT ISNULL(MAX(sort_order), -1) + 1 AS o FROM Sheets WHERE file_id = @f`, { f: T.uuid(fileId) }, tx);
      const id = await createUnionSheet(tx, fileId, body.name, Number(o?.o ?? 0), infos, u.id);
      await audit({ userId: u.id, action: 'sheet_create', entityType: 'sheet', entityId: id, fileId, sheetId: id, newValue: { name: body.name, union: infos.map((i) => i.label) } }, req, tx);
      return id;
    });
    await syncUnion(sheetId);
    ok(res, { id: sheetId }, 201);
  }),
);

/** Change the sources of a union sheet */
router.put(
  '/sheets/:id/union',
  ah(async (req, res) => {
    const id = pid(req);
    const { sheet } = await requireSheet(req.user!, id, LV.manage, undefined, true);
    const cfg = readUnionConfig(sheet);
    if (!cfg) throw forbidden('ชีตนี้ไม่ใช่ชีตรวมข้อมูล');
    const body = parse(z.object({ sources: sourcesSchema }), req.body);
    const infos = await assertUnionSources(req.user!, body.sources, id);
    // the structure must also equal the union's own columns (copied from the original first source)
    await q(`UPDATE Sheets SET union_config = @c WHERE sheet_id = @id`, { c: T.text(JSON.stringify({ ...cfg, sources: infos.map((i) => ({ sheetId: i.sheetId })), lastSyncAt: null })), id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'sheet_update', entityType: 'sheet', entityId: id, fileId: sheet.file_id, sheetId: id, newValue: { union: infos.map((i) => i.label) } }, req);
    ok(res, await syncUnion(id));
  }),
);

router.post(
  '/sheets/:id/union/sync',
  ah(async (req, res) => {
    const id = pid(req);
    await requireSheet(req.user!, id, LV.read);
    ok(res, await syncUnion(id));
  }),
);

export default router;
