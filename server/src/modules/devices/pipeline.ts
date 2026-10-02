import { q, T } from '../../config/db';
import { loadAuthUser } from '../../middleware/auth';
import { LV, requireSheet } from '../../shared/permissions';
import { logger } from '../../shared/logger';
import { runScan } from '../scan/routes';

const DEBOUNCE_MS = Math.max(0, Number(process.env.DEVICE_DEBOUNCE_MS) || 5000);
const recent = new Map<string, number>(); // device|value → last time (a tag in front of the reader is read many times a second)

const msgOf = (e: unknown) => ((e as { message?: string }).message ?? String(e)).slice(0, 300);

/**
 * One value from a device: written into every sheet bound to it, with that binding's scan format, in the name (and rights) of
 * the person who switched the binding on. Runs on the server so it works with nobody's page open.
 */
export async function handleDeviceValue(deviceId: string, raw: string): Promise<{ outcome: 'ok' | 'error' | 'unbound' | 'duplicate'; detail: string }> {
  const value = raw.trim().slice(0, 300);
  if (!value) return { outcome: 'error', detail: 'ค่าว่าง' };
  const now = Date.now();
  const key = `${deviceId}|${value}`;
  if (now - (recent.get(key) ?? 0) < DEBOUNCE_MS) return { outcome: 'duplicate', detail: '' };
  recent.set(key, now);
  if (recent.size > 5000) for (const [k, t] of recent) if (now - t > DEBOUNCE_MS) recent.delete(k);

  const bindings = await q(
    `SELECT b.sheet_id, b.profile_id, b.run_as_user, sh.sheet_name
     FROM DeviceBindings b JOIN Sheets sh ON sh.sheet_id = b.sheet_id WHERE b.device_id = @d AND b.enabled = 1 AND sh.is_deleted = 0`, { d: T.uuid(deviceId) });
  const parts: string[] = [];
  let failed = false;
  for (const b of bindings) {
    try {
      const user = await loadAuthUser(b.run_as_user);
      if (!user) throw new Error('ผู้ที่เปิดการผูกนี้ถูกปิดการใช้งานแล้ว');
      const { sheet } = await requireSheet(user, b.sheet_id, LV.write);
      const r = await runScan(user, sheet, b.sheet_id, value, b.profile_id);
      parts.push(`${b.sheet_name}: ${r.action === 'created' ? 'เพิ่ม' : 'อัปเดต'}แถว #${r.rowNo}`);
    } catch (e) { failed = true; parts.push(`${b.sheet_name}: ${msgOf(e)}`); }
  }
  const outcome = !bindings.length ? 'unbound' : failed ? 'error' : 'ok';
  const detail = (bindings.length ? parts.join(' | ') : 'ยังไม่มีชีตที่ผูกกับอุปกรณ์นี้').slice(0, 1000);
  try {
    await q(`INSERT INTO DeviceEvents (device_id, value, outcome, detail) VALUES (@d, @v, @o, @t)`, { d: T.uuid(deviceId), v: T.text(value), o: T.text(outcome), t: T.text(detail) });
    await q(`UPDATE Devices SET last_seen = SYSUTCDATETIME() WHERE device_id = @d`, { d: T.uuid(deviceId) });
  } catch (e) { logger.error(`device event log failed: ${msgOf(e)}`); }
  return { outcome, detail };
}
