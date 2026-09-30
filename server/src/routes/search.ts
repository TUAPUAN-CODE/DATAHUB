import { Router } from 'express';
import { env } from '../config/env';
import { q } from '../config/db';
import { ah, clamp, likeEscape, ok } from '../shared/http';
import { PermCtx } from '../shared/permissions';

const router = Router();

router.get(
  '/search',
  ah(async (req, res) => {
    const text = String(req.query.q ?? '').trim().slice(0, 100);
    const limit = clamp(Number(req.query.limit) || 20, 1, 100);
    if (!text) return ok(res, { folders: [], files: [] });
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    const ctx = await PermCtx.load(req.user!);
    const vis = await ctx.visibility();

    const folders = [...ctx.index.map.values()]
      .filter((f) => vis(f.id))
      .filter((f) => {
        const hay = `${f.name} ${f.description ?? ''}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, limit)
      .map((f) => ({ id: f.id, name: f.name, color: f.color, path: ctx.pathText(f.id), level: ctx.folderLevel(f.id) }));

    const params: Record<string, unknown> = {};
    const conds = tokens.map((t, i) => {
      params[`t${i}`] = `%${likeEscape(t)}%`;
      return `(f.file_name LIKE @t${i} OR f.description LIKE @t${i})`;
    });
    const rows = await q(
      `SELECT TOP 300 f.file_id, f.file_name, f.folder_id, f.created_by, f.color, f.description, f.updated_at
       FROM Files f WHERE f.is_deleted = 0 AND ${conds.join(' AND ')} ORDER BY f.updated_at DESC`,
      params,
    );
    const files = rows
      .map((f) => ({
        id: f.file_id, name: f.file_name, color: f.color, description: f.description, updatedAt: f.updated_at,
        folderId: f.folder_id, path: ctx.pathText(f.folder_id), level: ctx.fileLevel(f),
      }))
      .filter((f) => env.showLockedItems || f.level > 0)
      .slice(0, limit);
    ok(res, { folders, files });
  }),
);

export default router;
