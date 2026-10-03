import { q, T } from '../../config/db';
import { fromStorage, toColumnDef } from '../../shared/cellValue';
import { safeJson } from '../../shared/http';
import { logger } from '../../shared/logger';
import { loadColumns } from '../../services/cellWriter';
import { lineConfig, lineEnabled } from './config';
import { AlertCfgServer, AlertItem, buildMessage, levelToNotify, ratioPct, sortedLevels } from './logic';
import { pushText } from './line';

const MAX_ROWS_PER_COLUMN = 2000;
const MAX_ITEMS_PER_MESSAGE = 15;
const FAIL_BACKOFF_MS = 5 * 60_000;
const failedUntil = new Map<string, number>(); // target → time to retry (a bad token / blocked group must not be retried every minute)
let running = false;

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => { const t = new Date(d.getTime() + lineConfig.tzOffsetMinutes * 60000); return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`; };

/** One pass: for every column that has LINE notification on, tell the target about rows that reached a new level */
export async function runOnce(now = new Date()): Promise<{ sent: number }> {
  const cols = await q(
    `SELECT c.column_id, c.sheet_id, c.column_name, c.validation_rule, sh.sheet_name, f.file_id, f.file_name
     FROM Columns c JOIN Sheets sh ON sh.sheet_id = c.sheet_id JOIN Files f ON f.file_id = sh.file_id
     WHERE c.is_deleted = 0 AND f.is_deleted = 0 AND c.validation_rule LIKE N'%"notify"%'`);
  let sent = 0;
  for (const col of cols) {
    const cfg = safeJson<{ alert?: AlertCfgServer } | null>(col.validation_rule, null)?.alert;
    const target = cfg?.notify?.targetId;
    if (!cfg || !target || !cfg.levels?.length) continue;
    if ((failedUntil.get(target) ?? 0) > Date.now()) continue;
    try { sent += await handleColumn(col, cfg, now); } catch (e) {
      failedUntil.set(target, Date.now() + FAIL_BACKOFF_MS);
      logger.error(`LINE alert failed (${col.file_name} / ${col.column_name}): ${(e as Error).message}`);
    }
  }
  return { sent };
}

async function handleColumn(col: any, cfg: AlertCfgServer, now: Date): Promise<number> {
  const notify = cfg.notify!;
  const rows = await q(
    `SELECT TOP (${MAX_ROWS_PER_COLUMN}) r.row_id, r.row_order, s.value_date AS start_at, e.value_date AS end_at,
            COALESCE(l.value_float, CAST(l.value_int AS FLOAT)) AS limit_min
     FROM Rows r
     JOIN Cells s ON s.row_id = r.row_id AND s.column_id = @start AND s.value_date IS NOT NULL
     JOIN Cells l ON l.row_id = r.row_id AND l.column_id = @limit AND COALESCE(l.value_float, CAST(l.value_int AS FLOAT)) > 0
     LEFT JOIN Cells e ON e.row_id = r.row_id AND e.column_id = @end
     WHERE r.sheet_id = @sheet AND r.is_deleted = 0 AND e.value_date IS NULL AND s.value_date > DATEADD(DAY, -@days, SYSUTCDATETIME())
     ORDER BY s.value_date`,
    { start: T.uuid(cfg.startColumnId), limit: T.uuid(cfg.limitColumnId), end: T.uuid(cfg.endColumnId ?? '00000000-0000-0000-0000-000000000000'), sheet: T.uuid(col.sheet_id), days: T.int(lineConfig.windowDays) });

  const levels = sortedLevels(cfg.levels);
  const hits: { row: any; level: number; pct: number }[] = [];
  for (const r of rows) {
    const pct = ratioPct(new Date(r.start_at).getTime(), null, now.getTime(), Number(r.limit_min));
    if (pct === null) continue;
    const level = levelToNotify(cfg.levels, pct, notify.levelIdx);
    if (level >= 0) hits.push({ row: r, level, pct });
  }
  if (!hits.length) return 0;

  // claim: the unique key lets only one run announce a (row, level) — a higher level already sent covers the lower ones
  const fresh: typeof hits = [];
  for (const h of hits) {
    const done = await q(`SELECT 1 AS x FROM AlertNotified WHERE column_id = @c AND row_id = @r AND level_idx >= @l`, { c: T.uuid(col.column_id), r: T.uuid(h.row.row_id), l: T.int(h.level) });
    if (done.length) continue;
    try { await q(`INSERT INTO AlertNotified (column_id, row_id, level_idx) VALUES (@c, @r, @l)`, { c: T.uuid(col.column_id), r: T.uuid(h.row.row_id), l: T.int(h.level) }); fresh.push(h); } catch { /* claimed by another run */ }
  }
  if (!fresh.length) return 0;

  const labels = await labelValues(col.sheet_id, notify.labelColumnIds ?? [], fresh.map((h) => h.row.row_id));
  const items: AlertItem[] = fresh.map((h) => ({
    rowNo: h.row.row_order, pct: h.pct, levelLabel: levels[h.level].label || `เกิน ${levels[h.level].atPct}%`,
    elapsedMin: (now.getTime() - new Date(h.row.start_at).getTime()) / 60000, limitMin: Number(h.row.limit_min),
    startedAt: local(new Date(h.row.start_at)), labels: labels.get(h.row.row_id) ?? [],
  }));
  const link = lineConfig.appUrl ? `${lineConfig.appUrl}/files/${col.file_id}` : null;
  try {
    for (let i = 0; i < items.length; i += MAX_ITEMS_PER_MESSAGE) {
      await pushText(notify.targetId, buildMessage(`${col.file_name} › ${col.sheet_name}: ${col.column_name}`, items.slice(i, i + MAX_ITEMS_PER_MESSAGE), link));
    }
  } catch (e) {
    // not delivered: release the claims so the next pass tries again
    for (const h of fresh) await q(`DELETE FROM AlertNotified WHERE column_id = @c AND row_id = @r AND level_idx = @l`, { c: T.uuid(col.column_id), r: T.uuid(h.row.row_id), l: T.int(h.level) }).catch(() => undefined);
    throw e;
  }
  return fresh.length;
}

async function labelValues(sheetId: string, columnIds: string[], rowIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!columnIds.length || !rowIds.length) return out;
  const defs = new Map((await loadColumns(sheetId)).map((c) => [String(c.column_id).toLowerCase(), c]));
  for (const rowId of rowIds) {
    const parts: string[] = [];
    for (const cid of columnIds.slice(0, 4)) {
      const c = defs.get(cid.toLowerCase());
      if (!c) continue;
      const [cell] = await q(`SELECT value_text, value_int, value_float, value_date, value_bool, value_json FROM Cells WHERE row_id = @r AND column_id = @c`, { r: T.uuid(rowId), c: T.uuid(c.column_id) });
      const v = fromStorage(toColumnDef(c).data_type, cell);
      if (v === null || v === '') continue;
      parts.push(c.data_type === 'datetime' ? local(new Date(String(v))) : Array.isArray(v) ? v.join(',') : String(v));
    }
    out.set(rowId, parts);
  }
  return out;
}

export function startLineWorker(): (() => void) | void {
  if (!lineEnabled()) { logger.info('LINE alerts off (LINE_CHANNEL_ACCESS_TOKEN is not set)'); return; }
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runOnce(); } catch (e) { logger.error(`LINE alert pass failed: ${(e as Error).message}`); } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), lineConfig.intervalSec * 1000);
  timer.unref();
  logger.info(`LINE alerts on (every ${lineConfig.intervalSec}s)`);
  return () => clearInterval(timer);
}
