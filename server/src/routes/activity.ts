import { Router } from 'express';
import { q, T } from '../config/db';
import { ah, ok } from '../shared/http';
import { mapFile } from '../shared/mappers';
import { LV, PermCtx } from '../shared/permissions';
import { favoriteSet } from './folders';

const router = Router();

router.get(
  '/activity/recent-files',
  ah(async (req, res) => {
    const u = req.user!;
    const ctx = await PermCtx.load(u);
    const favs = await favoriteSet(u.id, 'file');
    const rows = await q(
      `SELECT TOP 24 f.file_id, f.file_name, f.folder_id, f.description, f.icon, f.color, f.status, f.created_by, f.created_at,
         f.updated_at, fo.folder_name, rf.viewed_at,
         (SELECT COUNT(*) FROM Sheets s WHERE s.file_id = f.file_id AND s.is_deleted = 0) AS sheet_count
       FROM RecentFiles rf JOIN Files f ON f.file_id = rf.file_id AND f.is_deleted = 0
       JOIN Folders fo ON fo.folder_id = f.folder_id
       WHERE rf.user_id = @u ORDER BY rf.viewed_at DESC`,
      { u: T.uuid(u.id) },
    );
    ok(
      res,
      rows
        .map((r) => ({ ...mapFile(r, ctx.fileLevel(r), favs.has(r.file_id)), viewedAt: r.viewed_at }))
        .filter((f) => f.level >= LV.read)
        .slice(0, 12),
    );
  }),
);

/** Latest activity per file (SharePoint-like "Activity" cards) */
router.get(
  '/activity/feed',
  ah(async (req, res) => {
    const u = req.user!;
    const ctx = await PermCtx.load(u);
    const favs = await favoriteSet(u.id, 'file');
    const rows = await q(
      `SELECT TOP 150 f.file_id, f.file_name, f.folder_id, f.description, f.icon, f.color, f.status, f.created_by, f.created_at,
         f.updated_at, fo.folder_name, la.created_at AS last_activity_at, la.action_type AS last_action,
         la.display_name AS last_activity_by, la.avatar_url AS last_activity_avatar,
         (SELECT COUNT(*) FROM Sheets s WHERE s.file_id = f.file_id AND s.is_deleted = 0) AS sheet_count
       FROM Files f JOIN Folders fo ON fo.folder_id = f.folder_id
       CROSS APPLY (
         SELECT TOP 1 a.created_at, a.action_type, us.display_name, us.avatar_url
         FROM AuditLog a JOIN Users us ON us.user_id = a.user_id
         WHERE a.file_id = f.file_id ORDER BY a.created_at DESC
       ) la
       WHERE f.is_deleted = 0 ORDER BY la.created_at DESC`,
    );
    ok(
      res,
      rows
        .map((r) => mapFile(r, ctx.fileLevel(r), favs.has(r.file_id)))
        .filter((f) => f.level >= LV.read)
        .slice(0, 16),
    );
  }),
);

export default router;
