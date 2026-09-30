import { Router } from 'express';
import { q, q1, T } from '../config/db';
import { ah, clamp, ok, pid } from '../shared/http';
import { mapNotification } from '../shared/mappers';

const router = Router();

router.get(
  '/notifications',
  ah(async (req, res) => {
    const u = T.uuid(req.user!.id);
    const limit = clamp(Number(req.query.limit) || 30, 1, 100);
    const unreadOnly = req.query.unread === 'true';
    const rows = await q(
      `SELECT TOP (${limit}) * FROM Notifications WHERE user_id = @u ${unreadOnly ? 'AND is_read = 0' : ''} ORDER BY created_at DESC`,
      { u },
    );
    const c = await q1(`SELECT COUNT(*) AS n FROM Notifications WHERE user_id = @u AND is_read = 0`, { u });
    ok(res, { items: rows.map(mapNotification), unreadCount: Number(c?.n ?? 0) });
  }),
);

router.post(
  '/notifications/read-all',
  ah(async (req, res) => {
    await q(`UPDATE Notifications SET is_read = 1 WHERE user_id = @u AND is_read = 0`, { u: T.uuid(req.user!.id) });
    ok(res, { read: true });
  }),
);

router.post(
  '/notifications/:id/read',
  ah(async (req, res) => {
    await q(`UPDATE Notifications SET is_read = 1 WHERE notification_id = @id AND user_id = @u`, { id: T.uuid(pid(req)), u: T.uuid(req.user!.id) });
    ok(res, { read: true });
  }),
);

export default router;
