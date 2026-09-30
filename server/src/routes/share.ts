import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../config/db';
import { audit } from '../shared/audit';
import { ah, AppError, forbidden, notFound, ok, parse, pid, zId } from '../shared/http';
import { mapColumn, mapSheet } from '../shared/mappers';
import { LV, PermCtx, requireFile, toLevel } from '../shared/permissions';
import { filterSchema, sortSchema } from '../shared/schemas';
import { loadColumns } from '../services/cellWriter';
import { queryRows } from '../services/rowQuery';

/** Links managed by signed-in file managers (mounted behind `authenticate`) */
export const shareManageRouter = Router();
/** Anonymous read-only access through a link (mounted before `authenticate`) */
export const sharePublicRouter = Router();

const mapLink = (r: any) => ({
  id: r.link_id,
  token: r.token,
  permission: r.permission as 'read' | 'write' | 'manage',
  allowGuest: !!r.allow_guest,
  expiresAt: r.expires_at,
  isActive: !!r.is_active,
  createdAt: r.created_at,
  createdByName: r.created_by_name ?? null,
  accessCount: r.access_count,
  lastUsedAt: r.last_used_at,
  expired: !!r.expires_at && new Date(r.expires_at) < new Date(),
});

async function findLink(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound('ลิงก์ไม่ถูกต้อง');
  const l = await q1(
    `SELECT l.*, f.file_name, f.color, f.folder_id, f.created_by AS file_created_by
     FROM ShareLinks l JOIN Files f ON f.file_id = l.file_id
     WHERE l.token = @t AND f.is_deleted = 0`,
    { t: token },
  );
  if (!l) throw notFound('ไม่พบลิงก์นี้ หรือไฟล์ถูกลบแล้ว');
  if (!l.is_active) throw new AppError(410, 'LINK_REVOKED', 'ลิงก์นี้ถูกยกเลิกแล้ว');
  if (l.expires_at && new Date(l.expires_at) < new Date()) throw new AppError(410, 'LINK_EXPIRED', 'ลิงก์นี้หมดอายุแล้ว');
  return l;
}

/* ---------------- managers ---------------- */
shareManageRouter.get(
  '/files/:id/share-links',
  ah(async (req, res) => {
    const id = pid(req);
    await requireFile(req.user!, id, LV.manage);
    const rows = await q(
      `SELECT l.*, u.display_name AS created_by_name FROM ShareLinks l LEFT JOIN Users u ON u.user_id = l.created_by
       WHERE l.file_id = @f AND l.is_active = 1 ORDER BY l.created_at DESC`,
      { f: T.uuid(id) },
    );
    ok(res, rows.map(mapLink));
  }),
);

shareManageRouter.post(
  '/files/:id/share-links',
  ah(async (req, res) => {
    const id = pid(req);
    const { file } = await requireFile(req.user!, id, LV.manage);
    const body = parse(
      z.object({
        permission: z.enum(['read', 'write', 'manage']).default('read'),
        allowGuest: z.boolean().default(true),
        expiresAt: z.string().datetime({ offset: true }).nullish().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullish(),
      }),
      req.body ?? {},
    );
    const token = crypto.randomBytes(24).toString('base64url');
    const row = await q1(
      `INSERT INTO ShareLinks (file_id, token, permission, allow_guest, expires_at, created_by) OUTPUT inserted.*
       VALUES (@f, @t, @p, @g, @e, @u)`,
      { f: T.uuid(id), t: token, p: body.permission, g: T.bit(body.allowGuest), e: T.dt(body.expiresAt ?? null), u: T.uuid(req.user!.id) },
    );
    await audit({ userId: req.user!.id, action: 'share_link_create', entityType: 'file', entityId: id, fileId: id, newValue: { ...body, name: file.file_name } }, req);
    ok(res, mapLink({ ...row, created_by_name: req.user!.displayName }), 201);
  }),
);

shareManageRouter.put(
  '/share-links/:id',
  ah(async (req, res) => {
    const id = pid(req);
    const l = await q1(`SELECT * FROM ShareLinks WHERE link_id = @id`, { id: T.uuid(id) });
    if (!l) throw notFound('ไม่พบลิงก์');
    await requireFile(req.user!, l.file_id, LV.manage);
    const body = parse(z.object({ permission: z.enum(['read', 'write', 'manage']), allowGuest: z.boolean() }), req.body);
    await q(`UPDATE ShareLinks SET permission = @p, allow_guest = @g WHERE link_id = @id`, { p: body.permission, g: T.bit(body.allowGuest), id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'share_link_update', entityType: 'file', entityId: l.file_id, fileId: l.file_id, newValue: body }, req);
    ok(res, { updated: true });
  }),
);

shareManageRouter.delete(
  '/share-links/:id',
  ah(async (req, res) => {
    const id = pid(req);
    const l = await q1(`SELECT * FROM ShareLinks WHERE link_id = @id`, { id: T.uuid(id) });
    if (!l) throw notFound('ไม่พบลิงก์');
    await requireFile(req.user!, l.file_id, LV.manage);
    await q(`UPDATE ShareLinks SET is_active = 0 WHERE link_id = @id`, { id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'share_link_revoke', entityType: 'file', entityId: l.file_id, fileId: l.file_id }, req);
    ok(res, { revoked: true });
  }),
);

/** A signed-in user opens a link: they receive the permission it carries (never lowering an existing one). */
shareManageRouter.post(
  '/share/:token/redeem',
  ah(async (req, res) => {
    const l = await findLink(String(req.params.token));
    const ctx = await PermCtx.load(req.user!);
    const before = ctx.fileLevel({ file_id: l.file_id, folder_id: l.folder_id, created_by: l.file_created_by });
    const want = toLevel(l.permission);
    let granted = false;
    if (want > before) {
      await q(
        `MERGE FileAccess AS t USING (SELECT @f AS file_id, @u AS user_id) AS s ON t.file_id = s.file_id AND t.user_id = s.user_id
         WHEN MATCHED THEN UPDATE SET permission = @p, granted_by = @by, granted_at = SYSUTCDATETIME(), expires_at = NULL
         WHEN NOT MATCHED THEN INSERT (file_id, user_id, permission, granted_by) VALUES (@f, @u, @p, @by);`,
        { f: T.uuid(l.file_id), u: T.uuid(req.user!.id), p: l.permission, by: T.uuid(l.created_by) },
      );
      granted = true;
      await audit({ userId: req.user!.id, action: 'share_link_redeem', entityType: 'file', entityId: l.file_id, fileId: l.file_id, newValue: { permission: l.permission } }, req);
    }
    await q(`UPDATE ShareLinks SET access_count = access_count + 1, last_used_at = SYSUTCDATETIME() WHERE link_id = @id`, { id: T.uuid(l.link_id) });
    ok(res, { fileId: l.file_id, permission: l.permission, granted });
  }),
);

/* ---------------- public (no account) ---------------- */
async function guestLink(token: string) {
  const l = await findLink(token);
  if (!l.allow_guest) throw forbidden('ลิงก์นี้ต้องเข้าสู่ระบบก่อนจึงจะเปิดได้', 'LOGIN_REQUIRED');
  return l;
}
async function guestSheet(l: any, sheetId: string) {
  const s = await q1(`SELECT * FROM Sheets WHERE sheet_id = @s AND file_id = @f AND is_deleted = 0`, { s: T.uuid(sheetId), f: T.uuid(l.file_id) });
  if (!s) throw notFound('ไม่พบชีต');
  return s;
}

sharePublicRouter.get(
  '/public/share/:token',
  ah(async (req, res) => {
    const l = await findLink(String(req.params.token));
    const sheets = await q(`SELECT * FROM Sheets WHERE file_id = @f AND is_deleted = 0 ORDER BY sort_order`, { f: T.uuid(l.file_id) });
    await q(`UPDATE ShareLinks SET access_count = access_count + 1, last_used_at = SYSUTCDATETIME() WHERE link_id = @id`, { id: T.uuid(l.link_id) });
    ok(res, {
      file: { id: l.file_id, name: l.file_name, color: l.color },
      permission: l.permission,
      allowGuest: !!l.allow_guest,
      // A guest only receives content when the link allows it
      sheets: l.allow_guest ? sheets.map(mapSheet) : [],
    });
  }),
);

sharePublicRouter.get(
  '/public/share/:token/sheets/:sheetId',
  ah(async (req, res) => {
    const l = await guestLink(String(req.params.token));
    const s = await guestSheet(l, zId.parse(req.params.sheetId));
    const cols = await loadColumns(s.sheet_id);
    ok(res, { sheet: mapSheet(s), columns: cols.filter((c) => !c.is_deleted).map(mapColumn) });
  }),
);

sharePublicRouter.post(
  '/public/share/:token/sheets/:sheetId/rows',
  ah(async (req, res) => {
    const l = await guestLink(String(req.params.token));
    const s = await guestSheet(l, zId.parse(req.params.sheetId));
    const body = parse(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(100),
        sorts: z.array(sortSchema).max(3).default([]),
        filters: z.array(filterSchema).max(20).default([]),
        search: z.string().max(200).optional(),
      }),
      req.body ?? {},
    );
    const cols = await loadColumns(s.sheet_id);
    const r = await queryRows(s.sheet_id, cols, body);
    // Do not leak who edited what to anonymous visitors
    ok(res, { ...r, users: {}, rows: r.rows.map((row: any) => ({ ...row, meta: {}, createdBy: '', updatedBy: null })) });
  }),
);
