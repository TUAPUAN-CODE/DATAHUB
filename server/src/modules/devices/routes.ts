import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../../config/db';
import { requireRole } from '../../middleware/auth';
import { ah, badRequest, notFound, ok, parse, pid, zId } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { handleDeviceValue } from './pipeline';

/** Public: an HTTP / IoT sender posts a value with its key (no login) */
export const deviceIngest = Router();
deviceIngest.post('/devices/ingest', ah(async (req, res) => {
  const key = String(req.get('x-device-key') ?? '');
  const { value } = parse(z.object({ value: z.string().min(1).max(300) }), req.body);
  if (key.length < 20) return void res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'device key ไม่ถูกต้อง' } });
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const d = await q1(`SELECT device_id, enabled FROM Devices WHERE kind = N'http' AND api_key_hash = @h`, { h: T.text(hash) });
  if (!d) return void res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'device key ไม่ถูกต้อง' } });
  if (!d.enabled) return void res.status(409).json({ success: false, error: { code: 'DISABLED', message: 'อุปกรณ์นี้ถูกปิดอยู่' } });
  ok(res, await handleDeviceValue(d.device_id, value));
}));

const router = Router();
const admin = requireRole('master', 'admin');
const map = (d: any) => ({ id: d.device_id, name: d.device_name, kind: d.kind, host: d.host, port: d.port, enabled: !!d.enabled, status: d.status, lastSeen: d.last_seen, lastError: d.last_error, bindings: Number(d.n_bind ?? 0) });

router.get('/devices', admin, ah(async (_req, res) => {
  const rows = await q(`SELECT d.device_id, d.device_name, d.kind, d.host, d.port, d.enabled, d.status, d.last_seen, d.last_error,
      (SELECT COUNT(*) FROM DeviceBindings b WHERE b.device_id = d.device_id AND b.enabled = 1) AS n_bind FROM Devices d ORDER BY d.device_name`);
  ok(res, { devices: rows.map(map), gateway: process.env.GATEWAY_ENABLED === '1' });
}));

const body = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(['rfid_tcp', 'http']), host: z.string().trim().max(200).nullish(), port: z.number().int().min(1).max(65535).nullish() });

router.post('/devices', admin, ah(async (req, res) => {
  const b = parse(body, req.body);
  if (b.kind === 'rfid_tcp' && (!b.host || !b.port)) throw badRequest('เครื่องอ่าน RFID ต้องระบุ IP และพอร์ต');
  const apiKey = b.kind === 'http' ? crypto.randomBytes(24).toString('hex') : null;
  const r = await q1(`INSERT INTO Devices (device_name, kind, host, port, api_key_hash, created_by) OUTPUT inserted.device_id VALUES (@n, @k, @h, @p, @a, @u)`,
    { n: T.text(b.name), k: T.text(b.kind), h: T.text(b.kind === 'rfid_tcp' ? b.host ?? null : null), p: T.int(b.kind === 'rfid_tcp' ? b.port ?? null : null), a: T.text(apiKey ? crypto.createHash('sha256').update(apiKey).digest('hex') : null), u: T.uuid(req.user!.id) });
  ok(res, { id: r!.device_id, apiKey }, 201); // the key is shown only now
}));

router.put('/devices/:id', admin, ah(async (req, res) => {
  const b = parse(body.partial().extend({ enabled: z.boolean().optional() }), req.body);
  const cur = await q1(`SELECT device_id, kind FROM Devices WHERE device_id = @d`, { d: T.uuid(pid(req)) });
  if (!cur) throw notFound('ไม่พบอุปกรณ์');
  await q(`UPDATE Devices SET device_name = ISNULL(@n, device_name), host = CASE WHEN kind = N'rfid_tcp' THEN ISNULL(@h, host) ELSE host END, port = CASE WHEN kind = N'rfid_tcp' THEN ISNULL(@p, port) ELSE port END,
           enabled = ISNULL(@e, enabled), status = CASE WHEN @e = 0 THEN N'off' ELSE status END WHERE device_id = @d`,
    { n: T.text(b.name ?? null), h: T.text(b.host ?? null), p: T.int(b.port ?? null), e: T.bit(b.enabled ?? null), d: T.uuid(cur.device_id) });
  ok(res, { saved: true });
}));

router.delete('/devices/:id', admin, ah(async (req, res) => {
  const d = T.uuid(pid(req));
  await q(`DELETE FROM DeviceBindings WHERE device_id = @d`, { d });
  await q(`DELETE FROM DeviceEvents WHERE device_id = @d`, { d });
  await q(`DELETE FROM Devices WHERE device_id = @d`, { d });
  ok(res, { removed: true });
}));

router.get('/devices/:id/events', admin, ah(async (req, res) => {
  const rows = await q(`SELECT TOP 50 event_id, value, received_at, outcome, detail FROM DeviceEvents WHERE device_id = @d ORDER BY event_id DESC`, { d: T.uuid(pid(req)) });
  ok(res, { events: rows.map((e) => ({ id: Number(e.event_id), value: e.value, at: e.received_at, outcome: e.outcome, detail: e.detail })) });
}));

/** Simulation: the same path a real reading takes (test the sheet setup without a reader) */
router.post('/devices/:id/test-event', admin, ah(async (req, res) => {
  const { value } = parse(z.object({ value: z.string().trim().min(1).max(300) }), req.body);
  const d = await q1(`SELECT device_id FROM Devices WHERE device_id = @d`, { d: T.uuid(pid(req)) });
  if (!d) throw notFound('ไม่พบอุปกรณ์');
  ok(res, await handleDeviceValue(d.device_id, `${value}`));
}));

/** For managers of a sheet: which devices write into this sheet */
router.get('/sheets/:id/devices', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.manage);
  const devices = await q(`SELECT device_id, device_name, kind, status FROM Devices ORDER BY device_name`);
  const binds = await q(`SELECT device_id, enabled, profile_id FROM DeviceBindings WHERE sheet_id = @s`, { s: T.uuid(sheetId) });
  const by = new Map(binds.map((b) => [String(b.device_id).toLowerCase(), b]));
  ok(res, { devices: devices.map((d) => { const b = by.get(String(d.device_id).toLowerCase()); return { id: d.device_id, name: d.device_name, kind: d.kind, status: d.status, bound: !!b, enabled: !!b?.enabled, profileId: b?.profile_id ?? null }; }) });
}));

router.put('/sheets/:id/devices/:deviceId', ah(async (req, res) => {
  const sheetId = pid(req);
  const u = req.user!;
  await requireSheet(u, sheetId, LV.manage);
  const b = parse(z.object({ enabled: z.boolean(), profileId: z.string().max(40).nullish() }), req.body);
  const dev = await q1(`SELECT device_id FROM Devices WHERE device_id = @d`, { d: T.uuid(String(req.params.deviceId)) });
  if (!dev) throw notFound('ไม่พบอุปกรณ์');
  await q(
    `MERGE DeviceBindings AS t USING (SELECT @d AS device_id, @s AS sheet_id) AS s ON t.device_id = s.device_id AND t.sheet_id = s.sheet_id
     WHEN MATCHED THEN UPDATE SET enabled = @e, profile_id = @p, run_as_user = @u
     WHEN NOT MATCHED THEN INSERT (device_id, sheet_id, enabled, profile_id, run_as_user) VALUES (@d, @s, @e, @p, @u);`,
    { d: T.uuid(dev.device_id), s: T.uuid(sheetId), e: T.bit(b.enabled), p: T.text(b.profileId ?? null), u: T.uuid(u.id) });
  ok(res, { saved: true });
}));

void zId;
export default router;
