import { Router } from 'express';
import { z } from 'zod';
import { q, T } from '../../config/db';
import { ah, badRequest, ok, parse, pid } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { logger } from '../../shared/logger';
import { lineConfig, lineEnabled } from './config';
import { pushText, replyText, validSignature } from './line';

/** Called by LINE (no login): learns the ids of users / groups that talk to the bot. Protected by the channel-secret signature. */
export const lineWebhook = Router();
lineWebhook.post('/line/webhook', ah(async (req, res) => {
  if (!validSignature((req as any).rawBody, req.get('x-line-signature'))) return void res.status(401).json({ success: false });
  res.json({ success: true }); // answer fast; LINE retries on slow replies
  try {
    for (const ev of (req.body?.events ?? []) as any[]) {
      const src = ev.source ?? {};
      const id: string | undefined = src.groupId ?? src.roomId ?? src.userId;
      if (!id) continue;
      const kind = src.groupId ? 'group' : src.roomId ? 'room' : 'user';
      await q(
        `MERGE LineTargets AS t USING (SELECT @id AS target_id) AS s ON t.target_id = s.target_id
         WHEN MATCHED THEN UPDATE SET last_seen = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (target_id, kind, label) VALUES (@id, @kind, @label);`,
        { id: T.text(id), kind: T.text(kind), label: T.text(kind === 'group' ? 'กลุ่ม LINE' : kind === 'room' ? 'ห้องแชต' : 'ผู้ใช้ LINE') });
      // typing "id" in the chat shows the id (handy to copy it elsewhere)
      if (ev.type === 'message' && ev.message?.type === 'text' && /^\s*(id|ไอดี)\s*$/i.test(ev.message.text) && ev.replyToken) await replyText(ev.replyToken, `ID: ${id}`);
    }
  } catch (e) { logger.error(`LINE webhook failed: ${(e as Error).message}`); }
}));

/** For managers of a sheet, from the alert editor */
const router = Router();

router.get('/sheets/:id/line/targets', ah(async (req, res) => {
  await requireSheet(req.user!, pid(req), LV.manage);
  const rows = await q(`SELECT TOP 100 target_id, kind, label, last_seen FROM LineTargets ORDER BY last_seen DESC`);
  ok(res, { enabled: lineEnabled(), targets: rows.map((r) => ({ id: r.target_id, kind: r.kind, label: r.label, lastSeen: r.last_seen })) });
}));

router.put('/sheets/:id/line/targets/:targetId', ah(async (req, res) => {
  await requireSheet(req.user!, pid(req), LV.manage);
  const body = parse(z.object({ label: z.string().trim().min(1).max(100) }), req.body);
  await q(`UPDATE LineTargets SET label = @l WHERE target_id = @t`, { l: T.text(body.label), t: T.text(req.params.targetId) });
  ok(res, {});
}));

router.post('/sheets/:id/line/test', ah(async (req, res) => {
  await requireSheet(req.user!, pid(req), LV.manage);
  if (!lineEnabled()) throw badRequest('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ที่เซิร์ฟเวอร์');
  const body = parse(z.object({ targetId: z.string().trim().min(5).max(64) }), req.body);
  try { await pushText(body.targetId, `✅ ทดสอบแจ้งเตือนจาก DataSheet Pro${lineConfig.appUrl ? `\n${lineConfig.appUrl}` : ''}`); } catch (e) { throw badRequest(`ส่ง LINE ไม่สำเร็จ: ${(e as Error).message}`); }
  ok(res, { sent: true });
}));

export default router;
