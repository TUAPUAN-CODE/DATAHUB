import crypto from 'crypto';
import { lineConfig } from './config';

const API = 'https://api.line.me/v2/bot/message';

async function call(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineConfig.accessToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`LINE ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

export const pushText = (to: string, text: string) => call('push', { to, messages: [{ type: 'text', text }] });
export const replyText = (replyToken: string, text: string) => call('reply', { replyToken, messages: [{ type: 'text', text }] });

/** X-Line-Signature = base64(HMAC-SHA256(channel secret, raw body)) */
export function validSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  if (!rawBody || !signature || !lineConfig.channelSecret) return false;
  const mac = crypto.createHmac('sha256', lineConfig.channelSecret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === mac.length && crypto.timingSafeEqual(given, mac);
}
