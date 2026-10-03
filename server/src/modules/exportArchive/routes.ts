import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { q, q1, T } from '../../config/db';
import { audit } from '../../shared/audit';
import { ah, badRequest, notFound, ok, parse, pid, safeJson, zId } from '../../shared/http';
import { LV, requireFile } from '../../shared/permissions';
import { archiveConfig } from './config';

const router = Router();
fs.mkdirSync(archiveConfig.dir, { recursive: true });

const metaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  sheetId: zId.nullish(),
  templateId: z.string().max(60).nullish(),
  templateName: z.string().max(200).nullish(),
  pageCount: z.number().int().min(0).max(100000).nullish(),
  rowCount: z.number().int().min(0).max(10_000_000).nullish(),
  filters: z.any().optional(),
  /** values typed into the export dialog (Date, Shift, Line, Plant …) */
  prompts: z.record(z.string().max(1000)).optional(),
  /** who signed: label of the signature slot + the name */
  signers: z.array(z.object({ label: z.string().max(200), name: z.string().max(200) })).max(20).optional(),
  note: z.string().max(1000).nullish(),
});

const map = (r: any) => ({
  id: r.archive_id,
  fileId: r.file_id,
  sheetId: r.sheet_id,
  title: r.title,
  templateName: r.template_name,
  originalName: r.original_name,
  sizeBytes: Number(r.size_bytes),
  sha256: r.sha256,
  pageCount: r.page_count,
  rowCount: r.row_count,
  meta: safeJson(r.meta_json, {}) ?? {},
  createdBy: r.created_by,
  createdByName: r.created_by_name ?? null,
  createdAt: r.created_at,
});

const hashFile = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });

const upload = multer({
  storage: multer.diskStorage({ destination: archiveConfig.dir, filename: (_req, _f, cb) => cb(null, `${crypto.randomUUID()}.pdf`) }),
  limits: { fileSize: archiveConfig.maxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, f.mimetype === 'application/pdf'),
});

/** The permission check runs BEFORE anything is written to disk */
const mayArchive = (req: Request, _res: Response, next: NextFunction) => {
  requireFile(req.user!, pid(req), LV.write).then(() => next(), next);
};

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150) || 'document';

/** Save an exported PDF (e.g. after the signature slots were filled) */
router.post(
  '/files/:id/exports',
  mayArchive,
  upload.single('pdf'),
  ah(async (req, res) => {
    const fileId = pid(req);
    const stored = req.file;
    if (!stored) throw badRequest('ไม่พบไฟล์ PDF ที่จะบันทึก');
    try {
      const head = Buffer.alloc(5);
      const fd = fs.openSync(stored.path, 'r');
      fs.readSync(fd, head, 0, 5, 0);
      fs.closeSync(fd);
      if (head.toString('latin1') !== '%PDF-') throw badRequest('ไฟล์ที่ส่งมาไม่ใช่ PDF');
      let raw: unknown;
      try { raw = JSON.parse(String(req.body?.meta ?? '{}')); } catch { throw badRequest('ข้อมูลประกอบ (meta) ไม่ถูกต้อง'); }
      const meta = parse(metaSchema, raw);
      const { sheetId, title, templateName, pageCount, rowCount, ...rest } = meta;
      const sha = await hashFile(stored.path);
      const row = await q1(
        `INSERT INTO ExportArchive (file_id, sheet_id, title, template_name, stored_name, original_name, size_bytes, sha256, page_count, row_count, meta_json, created_by)
         OUTPUT inserted.archive_id
         VALUES (@f, @s, @t, @tn, @sn, @on, @sz, @sha, @pc, @rc, @mj, @u)`,
        {
          f: T.uuid(fileId), s: T.uuid(sheetId ?? null), t: title, tn: T.text(templateName ?? null), sn: path.basename(stored.path),
          on: `${safeName(title)}.pdf`, sz: T.bigint(stored.size), sha, pc: T.int(pageCount ?? null), rc: T.int(rowCount ?? null),
          mj: T.text(JSON.stringify(rest)), u: T.uuid(req.user!.id),
        },
      );
      await audit({ userId: req.user!.id, action: 'export_archive', entityType: 'file', entityId: row!.archive_id, fileId, sheetId: sheetId ?? null,
        newValue: { title, template: templateName ?? null, sha256: sha, size: stored.size, signers: rest.signers ?? [] } }, req);
      const full = await q1(`SELECT a.*, u.display_name AS created_by_name FROM ExportArchive a JOIN Users u ON u.user_id = a.created_by WHERE a.archive_id = @id`, { id: T.uuid(row!.archive_id) });
      ok(res, map(full), 201);
    } catch (e) {
      fs.promises.unlink(stored.path).catch(() => undefined);
      throw e;
    }
  }),
);

/** Archived documents of a file (newest first) */
router.get(
  '/files/:id/exports',
  ah(async (req, res) => {
    const fileId = pid(req);
    const { level } = await requireFile(req.user!, fileId, LV.read);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const search = String(req.query.search ?? '').trim();
    const like = search ? `%${search.replace(/[[\]%_]/g, (m) => `[${m}]`)}%` : null;
    const where = `a.file_id = @f AND a.is_deleted = 0 ${like ? 'AND (a.title LIKE @l OR a.template_name LIKE @l OR u.display_name LIKE @l)' : ''}`;
    const params = { f: T.uuid(fileId), l: T.text(like), o: T.int(offset), n: T.int(limit) };
    const rows = await q(
      `SELECT a.*, u.display_name AS created_by_name FROM ExportArchive a JOIN Users u ON u.user_id = a.created_by
       WHERE ${where} ORDER BY a.created_at DESC OFFSET @o ROWS FETCH NEXT @n ROWS ONLY`, params);
    const total = await q1(`SELECT COUNT(*) AS n FROM ExportArchive a JOIN Users u ON u.user_id = a.created_by WHERE ${where}`, params);
    ok(res, { items: rows.map(map), total: Number(total?.n ?? 0), canDelete: level >= LV.manage });
  }),
);

async function loadArchive(id: string) {
  const row = await q1(`SELECT a.*, u.display_name AS created_by_name FROM ExportArchive a JOIN Users u ON u.user_id = a.created_by WHERE a.archive_id = @id AND a.is_deleted = 0`, { id: T.uuid(id) });
  if (!row) throw notFound('ไม่พบเอกสารที่บันทึกไว้');
  return row;
}
const diskPath = (stored: string) => path.join(archiveConfig.dir, path.basename(stored));

router.get(
  '/exports/:id/download',
  ah(async (req, res) => {
    const row = await loadArchive(pid(req));
    await requireFile(req.user!, row.file_id, LV.read);
    const file = diskPath(row.stored_name);
    if (!fs.existsSync(file)) throw notFound('ไฟล์เอกสารหายจากที่เก็บ กรุณาแจ้งผู้ดูแลระบบ');
    await audit({ userId: req.user!.id, action: 'export_archive_download', entityType: 'file', entityId: row.archive_id, fileId: row.file_id, newValue: { title: row.title } }, req);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.attachment(row.original_name);
    fs.createReadStream(file).pipe(res);
  }),
);

/** Re-computes the SHA-256 and compares it with the value stored when the document was archived */
router.get(
  '/exports/:id/verify',
  ah(async (req, res) => {
    const row = await loadArchive(pid(req));
    await requireFile(req.user!, row.file_id, LV.read);
    const file = diskPath(row.stored_name);
    if (!fs.existsSync(file)) return ok(res, { intact: false, reason: 'missing' });
    const sha = await hashFile(file);
    ok(res, { intact: sha === row.sha256, sha256: row.sha256 });
  }),
);

router.delete(
  '/exports/:id',
  ah(async (req, res) => {
    const row = await loadArchive(pid(req));
    await requireFile(req.user!, row.file_id, LV.manage);
    await q(`UPDATE ExportArchive SET is_deleted = 1, deleted_at = SYSUTCDATETIME(), deleted_by = @u WHERE archive_id = @id`, { id: T.uuid(row.archive_id), u: T.uuid(req.user!.id) });
    await audit({ userId: req.user!.id, action: 'export_archive_delete', entityType: 'file', entityId: row.archive_id, fileId: row.file_id, oldValue: { title: row.title } }, req);
    ok(res, { deleted: true });
  }),
);

export default router;
