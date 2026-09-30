import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../config/db';
import { ah, notFound, ok, parse, zId } from '../shared/http';
import { PermCtx } from '../shared/permissions';

const router = Router();

router.get(
  '/favorites',
  ah(async (req, res) => {
    const u = req.user!;
    const ctx = await PermCtx.load(u);
    const favs = await q(`SELECT entity_type, entity_id, created_at FROM Favorites WHERE user_id = @u ORDER BY created_at DESC`, { u: T.uuid(u.id) });
    const fileIds = favs.filter((f) => f.entity_type === 'file').map((f) => f.entity_id);
    const files = fileIds.length
      ? await q(
          `SELECT file_id, file_name, folder_id, created_by, color FROM Files WHERE is_deleted = 0
           AND file_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@ids))`,
          { ids: T.text(JSON.stringify(fileIds)) },
        )
      : [];
    const fileMap = new Map(files.map((f) => [f.file_id, f]));
    const items = favs
      .map((f) => {
        if (f.entity_type === 'folder') {
          const node = ctx.index.map.get(f.entity_id);
          if (!node) return null;
          return { type: 'folder', id: node.id, name: node.name, color: node.color, path: ctx.pathText(node.id), level: ctx.folderLevel(node.id) };
        }
        const file = fileMap.get(f.entity_id);
        if (!file) return null;
        return { type: 'file', id: file.file_id, name: file.file_name, color: file.color, path: ctx.pathText(file.folder_id), level: ctx.fileLevel(file) };
      })
      .filter(Boolean);
    ok(res, items);
  }),
);

router.post(
  '/favorites/toggle',
  ah(async (req, res) => {
    const u = req.user!;
    const { entityType, entityId } = parse(z.object({ entityType: z.enum(['file', 'folder']), entityId: zId }), req.body);
    const exists =
      entityType === 'file'
        ? await q1(`SELECT 1 AS x FROM Files WHERE file_id = @id AND is_deleted = 0`, { id: T.uuid(entityId) })
        : await q1(`SELECT 1 AS x FROM Folders WHERE folder_id = @id AND is_deleted = 0`, { id: T.uuid(entityId) });
    if (!exists) throw notFound();
    const p = { u: T.uuid(u.id), t: entityType, id: T.uuid(entityId) };
    const cur = await q1(`SELECT 1 AS x FROM Favorites WHERE user_id = @u AND entity_type = @t AND entity_id = @id`, p);
    if (cur) await q(`DELETE FROM Favorites WHERE user_id = @u AND entity_type = @t AND entity_id = @id`, p);
    else await q(`INSERT INTO Favorites (user_id, entity_type, entity_id) VALUES (@u, @t, @id)`, p);
    ok(res, { favorite: !cur });
  }),
);

export default router;
