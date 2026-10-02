import { q, T } from '../../config/db';
import { loadAuthUser } from '../../middleware/auth';
import { LV, requireSheet } from '../../shared/permissions';
import { logger } from '../../shared/logger';
import { readSettings } from '../../services/sheetSettings';
import { runScan } from '../scan/routes';
import { claimReading, releaseReading } from './cooldown';

const DEBOUNCE_MS = Math.max(0, Number(process.env.DEVICE_DEBOUNCE_MS) || 3000);
const recent = new Map<string, number>(); // device|value → last time (a tag in front of the reader is read many times a second)
const skipLogged = new Map<string, number>(); // sheet|value → when a "skipped" line was last written (one per minute, not one per reading)

const touched = new Map<string, number>();
/** "last read" of a device, written at most every 10 s */
function touch(deviceId: string, now: number) {
  if (now - (touched.get(deviceId) ?? 0) < 10_000) return;
  touched.set(deviceId, now);
  void q(`UPDATE Devices SET last_seen = SYSUTCDATETIME() WHERE device_id = @d`, { d: T.uuid(deviceId) }).catch(() => undefined);
}
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
  let skipped = 0;
  for (const b of bindings) {
    let claimed = false;
    try {
      // per sheet, shared by all readers: the same card is not used again within the sheet's waiting time
      const waitMin = Number((await readSettings(b.sheet_id)).devices?.cooldownMin) || 0;
      const c = await claimReading(b.sheet_id, value, waitMin * 60);
      if (!c.ok) {
        skipped++;
        const k = `${b.sheet_id}|${value}`;
        if (now - (skipLogged.get(k) ?? 0) > 60_000) { skipLogged.set(k, now); parts.push(`${b.sheet_name}: ข้าม — อ่านการ์ดนี้ซ้ำภายใน ${waitMin} นาที (เหลือ ~${Math.ceil(c.remainingSec / 60)} นาที)`); }
        continue;
      }
      claimed = waitMin > 0;
      const user = await loadAuthUser(b.run_as_user);
      if (!user) throw new Error('ผู้ที่เปิดการผูกนี้ถูกปิดการใช้งานแล้ว');
      const { sheet } = await requireSheet(user, b.sheet_id, LV.write);
      const r = await runScan(user, sheet, b.sheet_id, value, b.profile_id);
      parts.push(`${b.sheet_name}: ${r.action === 'created' ? 'เพิ่ม' : r.action === 'ignored' ? 'ไม่เปลี่ยน (ครบทุกช่องแล้ว)' : 'อัปเดต'}แถว #${r.rowNo}${r.stamped ? ` (ลงเวลา “${r.stamped}”)` : ''}`);
    } catch (e) { failed = true; parts.push(`${b.sheet_name}: ${msgOf(e)}`); if (claimed) await releaseReading(b.sheet_id, value); }
  }
  touch(deviceId, now);
  if (bindings.length && skipped === bindings.length && !parts.length) return { outcome: 'duplicate', detail: '' }; // only skipped, already written once
  const outcome = !bindings.length ? 'unbound' : failed ? 'error' : 'ok';
  const detail = (bindings.length ? parts.join(' | ') : 'ยังไม่มีชีตที่ผูกกับอุปกรณ์นี้').slice(0, 1000);
  try {
    await q(`INSERT INTO DeviceEvents (device_id, value, outcome, detail) VALUES (@d, @v, @o, @t)`, { d: T.uuid(deviceId), v: T.text(value), o: T.text(outcome), t: T.text(detail) });
  } catch (e) { logger.error(`device event log failed: ${msgOf(e)}`); }
  return { outcome, detail };
}
