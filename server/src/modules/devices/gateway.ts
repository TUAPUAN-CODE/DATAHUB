import net from 'net';
import { q, T } from '../../config/db';
import { logger } from '../../shared/logger';
import { createFrameParser, isValidEpc } from './rfidFrame';
import { handleDeviceValue } from './pipeline';

/**
 * Keeps one TCP connection per enabled "rfid_tcp" device (reconnects with back-off, cuts a silent half-open line) and feeds EPCs to the pipeline.
 * Off unless GATEWAY_ENABLED=1: a reader accepts ONE connection, so only ONE program may talk to it — do not enable it
 * while PFCM's RFIDc1.js is connected to the same reader.
 */
const SYNC_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;
const SILENCE_MS = Number(process.env.RFID_SILENCE_RECONNECT_MS ?? 10 * 60_000) || 0;

interface Conn { key: string; stop: () => void }
const conns = new Map<string, Conn>();

const setStatus = (id: string, status: string, error: string | null = null) =>
  q(`UPDATE Devices SET status = @s, last_error = @e WHERE device_id = @d`, { s: T.text(status), e: T.text(error), d: T.uuid(id) }).catch(() => undefined);

function connect(id: string, name: string, host: string, port: number): Conn {
  let sock: net.Socket | null = null;
  let timer: NodeJS.Timeout | null = null;
  let silence: NodeJS.Timeout | null = null;
  let stopped = false;
  let attempt = 0;
  const parser = createFrameParser();

  const armSilence = () => {
    if (!SILENCE_MS) return;
    if (silence) clearTimeout(silence);
    silence = setTimeout(() => { logger.warn(`RFID ${name}: ไม่มีข้อมูลนาน ต่อใหม่`); sock?.destroy(); }, SILENCE_MS);
  };
  const retry = () => {
    if (stopped) return;
    const wait = Math.min(30_000, 2000 * 2 ** Math.min(attempt++, 4));
    timer = setTimeout(open, wait);
  };
  function open() {
    if (stopped) return;
    parser.reset();
    sock = net.createConnection({ host, port });
    sock.setTimeout(CONNECT_TIMEOUT_MS, () => { if (!sock?.remoteAddress) sock?.destroy(new Error('เชื่อมต่อหมดเวลา')); else sock.setTimeout(0); });
    sock.setKeepAlive(true, 15_000);
    sock.on('connect', () => { attempt = 0; sock?.setTimeout(0); void setStatus(id, 'connected'); logger.info(`RFID ${name}: เชื่อมต่อ ${host}:${port}`); armSilence(); });
    sock.on('data', (d) => {
      armSilence();
      for (const epc of parser.push(d)) if (isValidEpc(epc)) void handleDeviceValue(id, epc).catch((e) => logger.error(`RFID ${name}: ${(e as Error).message}`));
    });
    sock.on('error', (e) => { void setStatus(id, 'error', e.message.slice(0, 300)); });
    sock.on('close', () => { if (silence) clearTimeout(silence); if (!stopped) { void setStatus(id, 'disconnected'); retry(); } });
  }
  open();
  return { key: `${host}:${port}|${name}`, stop: () => { stopped = true; if (timer) clearTimeout(timer); if (silence) clearTimeout(silence); sock?.destroy(); void setStatus(id, 'off'); } };
}

async function sync() {
  const rows = await q(`SELECT device_id, device_name, host, port FROM Devices WHERE kind = N'rfid_tcp' AND enabled = 1 AND host IS NOT NULL AND port IS NOT NULL`);
  const want = new Map(rows.map((r) => [String(r.device_id).toLowerCase(), r]));
  for (const [id, c] of conns) {
    const w = want.get(id);
    if (!w || c.key !== `${w.host}:${w.port}|${w.device_name}`) { c.stop(); conns.delete(id); }
  }
  for (const [id, r] of want) if (!conns.has(id)) conns.set(id, connect(id, r.device_name, r.host, Number(r.port)));
}

export function startGateway(): void {
  if (process.env.GATEWAY_ENABLED !== '1') { logger.info('RFID gateway off (set GATEWAY_ENABLED=1 on ONE server process to enable)'); return; }
  const tick = () => void sync().catch((e) => logger.error(`RFID gateway sync failed: ${(e as Error).message}`));
  tick();
  setInterval(tick, SYNC_MS).unref();
  setInterval(() => void q(`DELETE FROM DeviceEvents WHERE received_at < DATEADD(DAY, -30, SYSUTCDATETIME())`).catch(() => undefined), 6 * 3600_000).unref();
  logger.info('RFID gateway on');
}
