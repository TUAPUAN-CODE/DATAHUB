import { q, T } from '../config/db';
import { emitToUser } from '../socket';
import { logger } from './logger';
import { mapNotification } from './mappers';

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  link?: string | null;
}

/** Stores a notification for each user and pushes it over the socket. Never throws. */
export async function notify(userIds: string[], n: NotificationInput) {
  const ids = [...new Set(userIds.filter(Boolean).map((i) => i.toLowerCase()))];
  if (!ids.length) return;
  try {
    const rows = await q(
      `INSERT INTO Notifications (user_id, type, title, message, link)
       OUTPUT inserted.*
       SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER), @type, @title, @message, @link FROM OPENJSON(@ids)`,
      {
        ids: T.text(JSON.stringify(ids)),
        type: n.type,
        title: n.title.slice(0, 300),
        message: n.message.slice(0, 2000),
        link: T.text(n.link ?? null),
      },
    );
    for (const r of rows) emitToUser(r.user_id, 'notification', mapNotification(r));
  } catch (e: any) {
    logger.error(`notify failed: ${e?.message}`);
  }
}
