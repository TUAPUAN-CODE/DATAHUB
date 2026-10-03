import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T } from '../../config/db';
import { requireRole } from '../../middleware/auth';
import { ah, badRequest, notFound, ok, parse, pid, safeJson, zId } from '../../shared/http';
import { LV, requireSheet } from '../../shared/permissions';
import { readSettings, writeSettingsKey } from '../../services/sheetSettings';
import { handleDeviceValue } from './pipeline';
import { printSlip, SlipCfg } from './slip';
import { loadColumns } from '../../services/cellWriter';
import { syncGatewayNow } from './gateway';
import { isHex } from './rfidFrame';

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
const map = (d: any) => ({ id: d.device_id, name: d.device_name, kind: d.kind, host: d.host, port: d.port, initHex: d.init_hex ?? null, startHex: d.start_hex ?? null, enabled: !!d.enabled, status: d.status, lastSeen: d.last_seen, lastError: d.last_error, bindings: Number(d.n_bind ?? 0) });

router.get('/devices', admin, ah(async (_req, res) => {
  const rows = await q(`SELECT d.device_id, d.device_name, d.kind, d.host, d.port, d.init_hex, d.start_hex, d.enabled, d.status, d.last_seen, d.last_error,
      (SELECT COUNT(*) FROM DeviceBindings b WHERE b.device_id = d.device_id AND b.enabled = 1) AS n_bind FROM Devices d ORDER BY d.device_name`);
  ok(res, { devices: rows.map(map), gateway: process.env.GATEWAY_ENABLED === '1' });
}));

const body = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(['rfid_tcp', 'http']), host: z.string().trim().max(200).nullish(), port: z.number().int().min(1).max(65535).nullish(), initHex: z.string().trim().max(200).nullish(), startHex: z.string().trim().max(200).nullish() });
const hexOk = (h?: string | null) => !h || isHex(h);

router.post('/devices', admin, ah(async (req, res) => {
  const b = parse(body, req.body);
  if (b.kind === 'rfid_tcp' && (!b.host || !b.port)) throw badRequest('เครื่องอ่าน RFID ต้องระบุ IP และพอร์ต');
  if (!hexOk(b.initHex) || !hexOk(b.startHex)) throw badRequest('คำสั่งเริ่มอ่านต้องเป็นเลขฐาน 16 เป็นคู่ เช่น 7CFFFF20');
  const apiKey = b.kind === 'http' ? crypto.randomBytes(24).toString('hex') : null;
  const r = await q1(`INSERT INTO Devices (device_name, kind, host, port, api_key_hash, init_hex, start_hex, created_by) OUTPUT inserted.device_id VALUES (@n, @k, @h, @p, @a, @i, @st, @u)`,
    { n: T.text(b.name), k: T.text(b.kind), i: T.text(b.kind === 'rfid_tcp' ? b.initHex || null : null), st: T.text(b.kind === 'rfid_tcp' ? b.startHex || null : null), h: T.text(b.kind === 'rfid_tcp' ? b.host ?? null : null), p: T.int(b.kind === 'rfid_tcp' ? b.port ?? null : null), a: T.text(apiKey ? crypto.createHash('sha256').update(apiKey).digest('hex') : null), u: T.uuid(req.user!.id) });
  void syncGatewayNow();
  ok(res, { id: r!.device_id, apiKey }, 201); // the key is shown only now
}));

router.put('/devices/:id', admin, ah(async (req, res) => {
  const b = parse(body.partial().extend({ enabled: z.boolean().optional() }), req.body);
  if (!hexOk(b.initHex) || !hexOk(b.startHex)) throw badRequest('คำสั่งเริ่มอ่านต้องเป็นเลขฐาน 16 เป็นคู่ เช่น 7CFFFF20');
  const cur = await q1(`SELECT device_id, kind FROM Devices WHERE device_id = @d`, { d: T.uuid(pid(req)) });
  if (!cur) throw notFound('ไม่พบอุปกรณ์');
  await q(`UPDATE Devices SET device_name = ISNULL(@n, device_name), host = CASE WHEN kind = N'rfid_tcp' THEN ISNULL(@h, host) ELSE host END, port = CASE WHEN kind = N'rfid_tcp' THEN ISNULL(@p, port) ELSE port END,
           init_hex = CASE WHEN kind = N'rfid_tcp' AND @i IS NOT NULL THEN NULLIF(@i, N'-') ELSE init_hex END, start_hex = CASE WHEN kind = N'rfid_tcp' AND @st IS NOT NULL THEN NULLIF(@st, N'-') ELSE start_hex END,
           enabled = ISNULL(@e, enabled), status = CASE WHEN @e = 0 THEN N'off' ELSE status END WHERE device_id = @d`,
    { n: T.text(b.name ?? null), h: T.text(b.host ?? null), p: T.int(b.port ?? null), i: T.text(b.initHex === undefined || b.initHex === null ? null : b.initHex || '-'), st: T.text(b.startHex === undefined || b.startHex === null ? null : b.startHex || '-'), e: T.bit(b.enabled ?? null), d: T.uuid(cur.device_id) });
  void syncGatewayNow();
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

/* ---------------- slip printers (print-agent of PFCM) ---------------- */
const printerBody = z.object({
  name: z.string().trim().min(1).max(100),
  agentUrl: z.string().trim().url().max(300),
  printerHost: z.string().trim().max(200).nullish(), printerShare: z.string().trim().max(100).nullish(),
  dotWidth: z.number().int().min(100).max(1600).nullish(), enabled: z.boolean().optional(),
});
const printerMap = (p: any) => ({ id: p.printer_id, name: p.printer_name, agentUrl: p.agent_url, printerHost: p.printer_host, printerShare: p.printer_share, dotWidth: p.dot_width, enabled: !!p.enabled });

router.get('/printers', admin, ah(async (_req, res) => {
  ok(res, { printers: (await q(`SELECT printer_id, printer_name, agent_url, printer_host, printer_share, dot_width, enabled FROM Printers ORDER BY printer_name`)).map(printerMap) });
}));
router.post('/printers', admin, ah(async (req, res) => {
  const b = parse(printerBody, req.body);
  if (!!b.printerHost !== !!b.printerShare) throw badRequest('ถ้าพิมพ์ผ่านเครื่องที่แชร์เครื่องพิมพ์ ต้องใส่ทั้ง IP/ชื่อเครื่อง และชื่อ share');
  const r = await q1(`INSERT INTO Printers (printer_name, agent_url, printer_host, printer_share, dot_width, created_by) OUTPUT inserted.printer_id VALUES (@n, @a, @h, @s, @w, @u)`,
    { n: T.text(b.name), a: T.text(b.agentUrl), h: T.text(b.printerHost || null), s: T.text(b.printerShare || null), w: T.int(b.dotWidth ?? null), u: T.uuid(req.user!.id) });
  ok(res, { id: r!.printer_id }, 201);
}));
router.put('/printers/:id', admin, ah(async (req, res) => {
  const b = parse(printerBody.partial(), req.body);
  await q(`UPDATE Printers SET printer_name = ISNULL(@n, printer_name), agent_url = ISNULL(@a, agent_url), printer_host = CASE WHEN @hset = 1 THEN @h ELSE printer_host END, printer_share = CASE WHEN @hset = 1 THEN @s ELSE printer_share END,
          dot_width = CASE WHEN @wset = 1 THEN @w ELSE dot_width END, enabled = ISNULL(@e, enabled) WHERE printer_id = @p`,
    { n: T.text(b.name ?? null), a: T.text(b.agentUrl ?? null), hset: T.bit('printerHost' in b || 'printerShare' in b), h: T.text(b.printerHost || null), s: T.text(b.printerShare || null), wset: T.bit('dotWidth' in b), w: T.int(b.dotWidth ?? null), e: T.bit(b.enabled ?? null), p: T.uuid(pid(req)) });
  ok(res, { saved: true });
}));
router.delete('/printers/:id', admin, ah(async (req, res) => {
  await q(`UPDATE DeviceBindings SET printer_id = NULL WHERE printer_id = @p`, { p: T.uuid(pid(req)) });
  await q(`DELETE FROM Printers WHERE printer_id = @p`, { p: T.uuid(pid(req)) });
  ok(res, { removed: true });
}));
/** A test slip, to see that the agent, the share and the paper work */
router.post('/printers/:id/test', admin, ah(async (req, res) => {
  const p = await q1(`SELECT printer_id, printer_name, agent_url, printer_host, printer_share, dot_width FROM Printers WHERE printer_id = @p`, { p: T.uuid(pid(req)) });
  if (!p) throw notFound('ไม่พบเครื่องพิมพ์');
  try {
    const res2 = await fetch(`${String(p.agent_url).replace(/\/+$/, '')}/print-generic`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ identifier: `test:${p.printer_id}:${Date.now()}`, title: 'ทดสอบเครื่องพิมพ์', subtitle: p.printer_name, rows: [{ label: 'เครื่องพิมพ์', value: p.printer_name }, { label: 'เวลา', value: new Date().toLocaleString('th-TH') }], qr: 'DataSheet Pro', printerHost: p.printer_host || undefined, printerShare: p.printer_share || undefined, printerDotWidth: p.dot_width || undefined }),
    });
    const j = (await res2.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res2.ok || !j.ok) throw new Error(j.error ?? `Print Agent ตอบ ${res2.status}`);
  } catch (e) { throw badRequest(`พิมพ์ทดสอบไม่สำเร็จ: ${(e as Error).message}`); }
  ok(res, { sent: true });
}));

/** For managers of a sheet: which devices write into this sheet */
router.get('/sheets/:id/devices', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.manage);
  const devices = await q(`SELECT device_id, device_name, kind, status FROM Devices ORDER BY device_name`);
  const binds = await q(`SELECT device_id, enabled, profile_id, printer_id, slip_json FROM DeviceBindings WHERE sheet_id = @s`, { s: T.uuid(sheetId) });
  const printers = await q(`SELECT printer_id, printer_name FROM Printers WHERE enabled = 1 ORDER BY printer_name`);
  const by = new Map(binds.map((b) => [String(b.device_id).toLowerCase(), b]));
  const cooldownMin = Number((await readSettings(sheetId)).devices?.cooldownMin) || 0;
  ok(res, { cooldownMin, printers: printers.map((p) => ({ id: p.printer_id, name: p.printer_name })), devices: devices.map((d) => { const b = by.get(String(d.device_id).toLowerCase()); return { id: d.device_id, name: d.device_name, kind: d.kind, status: d.status, bound: !!b, enabled: !!b?.enabled, profileId: b?.profile_id ?? null, printerId: b?.printer_id ?? null, slip: safeJson<SlipCfg | null>(b?.slip_json, null) }; }) });
}));

router.put('/sheets/:id/devices/:deviceId', ah(async (req, res) => {
  const sheetId = pid(req);
  const u = req.user!;
  await requireSheet(u, sheetId, LV.manage);
  const b = parse(z.object({
    enabled: z.boolean(), profileId: z.string().max(40).nullish(), printerId: zId.nullish(),
    slip: z.object({ title: z.string().max(80).nullish(), columnIds: z.array(zId).max(30).nullish(), qr: z.enum(['none', 'rowNo', 'column']).optional(), qrColumnId: zId.nullish(), onlyStampColumnId: zId.nullish() }).nullish(),
  }), req.body);
  if (b.printerId && !(await q1(`SELECT printer_id FROM Printers WHERE printer_id = @p`, { p: T.uuid(b.printerId) }))) throw badRequest('ไม่พบเครื่องพิมพ์ที่เลือก');
  if (b.slip) {
    const cols = new Set((await loadColumns(sheetId)).map((c) => c.column_id));
    for (const id of [...(b.slip.columnIds ?? []), b.slip.qrColumnId, b.slip.onlyStampColumnId]) if (id && !cols.has(id)) throw badRequest('ไม่พบคอลัมน์ที่เลือกในสลิป (อาจถูกลบแล้ว)');
  }
  const dev = await q1(`SELECT device_id FROM Devices WHERE device_id = @d`, { d: T.uuid(String(req.params.deviceId)) });
  if (!dev) throw notFound('ไม่พบอุปกรณ์');
  await q(
    `MERGE DeviceBindings AS t USING (SELECT @d AS device_id, @s AS sheet_id) AS s ON t.device_id = s.device_id AND t.sheet_id = s.sheet_id
     WHEN MATCHED THEN UPDATE SET enabled = @e, profile_id = @p, run_as_user = @u, printer_id = CASE WHEN @prset = 1 THEN @pr ELSE printer_id END, slip_json = CASE WHEN @slset = 1 THEN @sl ELSE slip_json END
     WHEN NOT MATCHED THEN INSERT (device_id, sheet_id, enabled, profile_id, run_as_user, printer_id, slip_json) VALUES (@d, @s, @e, @p, @u, @pr, @sl);`,
    { d: T.uuid(dev.device_id), s: T.uuid(sheetId), e: T.bit(b.enabled), p: T.text(b.profileId ?? null), u: T.uuid(u.id), prset: T.bit('printerId' in b), slset: T.bit('slip' in b), pr: T.uuid(b.printerId ?? null), sl: T.text(b.slip ? JSON.stringify(b.slip) : null) });
  ok(res, { saved: true });
}));

/** Waiting time of a sheet: the same card is not used again within N minutes — shared by every reader that writes into the sheet */
router.put('/sheets/:id/devices-settings', ah(async (req, res) => {
  const sheetId = pid(req);
  await requireSheet(req.user!, sheetId, LV.manage);
  const b = parse(z.object({ cooldownMin: z.number().min(0).max(1440) }), req.body);
  await writeSettingsKey(sheetId, 'devices', b.cooldownMin > 0 ? { cooldownMin: b.cooldownMin } : null);
  ok(res, { saved: true });
}));

void zId; void printSlip;
export default router;
