import { idList, jsonParam, q, q1, T } from '../../config/db';
import { env } from '../../config/env';
import { fromStorage, toColumnDef } from '../../shared/cellValue';
import { loadColumns } from '../../services/cellWriter';
import { logger } from '../../shared/logger';

/** What goes on the slip of one row */
export interface SlipCfg {
  title?: string | null;
  /** columns shown on the slip, in order */ columnIds?: string[] | null;
  qr?: 'none' | 'rowNo' | 'column';
  qrColumnId?: string | null;
  /** print only when this time column was the one stamped by the reading (e.g. only on "ออกห้องเย็น"); empty = every reading */
  onlyStampColumnId?: string | null;
}

export interface PrinterRow { printer_id: string; printer_name: string; agent_url: string; printer_host: string | null; printer_share: string | null; dot_width: number | null }

const pad = (n: number) => String(n).padStart(2, '0');
const localText = (d: Date) => { const t = new Date(d.getTime() + env.tzOffsetMinutes * 60000); return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear() + 543} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`; };

/** The rows the slip shows: "column name: value" in the order the manager chose */
export async function slipRows(sheetId: string, rowId: string, columnIds: string[]): Promise<{ label: string; value: string }[]> {
  if (!columnIds.length) return [];
  const cols = new Map((await loadColumns(sheetId)).map((c) => [String(c.column_id).toLowerCase(), c]));
  const cells = await q(`SELECT column_id, value_text, value_int, value_float, value_date, value_bool, value_json FROM Cells WHERE row_id = @r AND column_id IN ${idList('@cc')}`, { r: T.uuid(rowId), cc: jsonParam(columnIds) });
  const byCol = new Map(cells.map((c) => [String(c.column_id).toLowerCase(), c]));
  const out: { label: string; value: string }[] = [];
  for (const id of columnIds) {
    const c = cols.get(id.toLowerCase());
    if (!c) continue;
    const def = toColumnDef(c);
    const v = fromStorage(def.data_type, byCol.get(id.toLowerCase()));
    let text = '';
    if (v === null || v === '') text = '-';
    else if (def.data_type === 'datetime') text = `${localText(new Date(String(v)))} น.`;
    else if (def.data_type === 'date') { const [y, m, d] = String(v).split('-'); text = `${d}/${m}/${Number(y) + 543}`; }
    else if (def.data_type === 'boolean') text = v ? 'ใช่' : 'ไม่ใช่';
    else if (def.data_type === 'select') text = def.options.find((o) => o.value === v)?.label ?? String(v);
    else if (Array.isArray(v)) text = def.data_type === 'multi_select' ? v.map((x) => def.options.find((o) => o.value === x)?.label ?? x).join(', ') : `${v.length} รูป`;
    else text = String(v);
    out.push({ label: def.column_name, value: text });
  }
  return out;
}

/** Sends the slip of a row to the print-agent of the printer (same agent, same printers as PFCM) */
export async function printSlip(printer: PrinterRow, args: { sheetName: string; sheetId: string; rowId: string; rowNo: number; cfg: SlipCfg; stamped?: string | null; action: string }): Promise<void> {
  const { cfg } = args;
  const rows = await slipRows(args.sheetId, args.rowId, cfg.columnIds ?? []);
  if (args.stamped) rows.unshift({ label: 'บันทึกเวลา', value: `${args.stamped} ${localText(new Date())} น.` });
  let qr: string | null = null;
  if (cfg.qr === 'rowNo') qr = `${args.sheetName}#${args.rowNo}`;
  else if (cfg.qr === 'column' && cfg.qrColumnId) qr = (await slipRows(args.sheetId, args.rowId, [cfg.qrColumnId]))[0]?.value ?? null;
  const body = {
    identifier: `${args.sheetId}:${args.rowId}:${args.stamped ?? args.action}`,
    title: cfg.title || args.sheetName,
    subtitle: `แถว #${args.rowNo}`,
    rows, qr: qr && qr !== '-' ? qr : undefined,
    footer: localText(new Date()),
    printerHost: printer.printer_host || undefined,
    printerShare: printer.printer_share || undefined,
    printerDotWidth: printer.dot_width || undefined,
  };
  const res = await fetch(`${printer.agent_url.replace(/\/+$/, '')}/print-generic`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; deduped?: boolean };
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Print Agent ตอบ ${res.status}`);
  logger.info(`slip printed (${printer.printer_name}) row #${args.rowNo}${json.deduped ? ' [deduped by the agent]' : ''}`);
}

export const loadPrinter = (id: string) => q1<PrinterRow>(`SELECT printer_id, printer_name, agent_url, printer_host, printer_share, dot_width FROM Printers WHERE printer_id = @p AND enabled = 1`, { p: T.uuid(id) });
