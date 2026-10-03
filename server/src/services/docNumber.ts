import { q, T, Tx } from '../config/db';
import { env } from '../config/env';
import { ColumnDef } from '../shared/cellValue';
import { AuthUser } from '../middleware/auth';
import { badRequest } from '../shared/http';
import { loadColumns } from './cellWriter';
import { assertLookupConfig, Lookup, lookupValues } from './lookup';

/**
 * Auto-numbered document ids, e.g. "CSM-260926-009" = {PREFIX}-{YYMMDD}-{SEQ:3}
 *  - {PREFIX}  chosen by the user from a fixed list or from a column of another sheet (CSM, CSN, CSR …)
 *  - date tokens  {YYYY} {YY} {MM} {DD} {YYMMDD} {YYYYMMDD} {YYMM} {BBBB} {BB} (Buddhist year)
 *  - {SEQ:n}   running number, zero-padded to n digits; it restarts whenever the rest of the text changes
 *               (a new day, another prefix …), because the next number is "highest existing + 1" for the same text.
 */
export interface DocNumberCfg {
  template: string;
  prefixes?: string[] | null;
  prefixLookup?: Lookup | null;
  /** column (date) of the same row used for the date tokens; empty = today */
  dateColumnId?: string | null;
}

export const getDocCfg = (col: Pick<ColumnDef, 'validation' | 'data_type'>): DocNumberCfg | null => {
  const d = (col.validation as { docNumber?: DocNumberCfg } | undefined)?.docNumber;
  return col.data_type === 'doc_number' && d?.template ? d : null;
};

const TOKEN = /\{(PREFIX|YYYYMMDD|YYMMDD|YYYY|YYMM|YY|MM|DD|BBBB|BB|SEQ(?::(\d{1,2}))?)\}/g;
export const hasPrefixToken = (t: string) => /\{PREFIX\}/.test(t);
export const seqCount = (t: string) => (t.match(/\{SEQ(?::\d{1,2})?\}/g) ?? []).length;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** The wall-clock date used for numbering: a date string (yyyy-mm-dd) or "today" in the configured time zone */
export function dateParts(dateStr?: string | null) {
  let y: number, m: number, d: number;
  const hit = dateStr && /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
  else {
    const t = new Date(Date.now() + env.tzOffsetMinutes * 60_000);
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
  }
  return { y, m, d };
}

/** Renders the template; `seq` null leaves the SEQ token as a placeholder (returns the parts around it) */
export function render(template: string, prefix: string | null, date: { y: number; m: number; d: number }, seq: number | null): string {
  const be = date.y + 543;
  return template.replace(TOKEN, (_m, tok: string, width?: string) => {
    if (tok.startsWith('SEQ')) return seq === null ? '\u0000' : pad(seq, width ? Number(width) : 1);
    switch (tok) {
      case 'PREFIX': return prefix ?? '';
      case 'YYYY': return String(date.y);
      case 'YY': return pad(date.y % 100);
      case 'MM': return pad(date.m);
      case 'DD': return pad(date.d);
      case 'YYMMDD': return `${pad(date.y % 100)}${pad(date.m)}${pad(date.d)}`;
      case 'YYYYMMDD': return `${date.y}${pad(date.m)}${pad(date.d)}`;
      case 'YYMM': return `${pad(date.y % 100)}${pad(date.m)}`;
      case 'BBBB': return String(be);
      case 'BB': return pad(be % 100);
      default: return '';
    }
  });
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const likeEsc = (s: string) => s.replace(/[%_[]/g, (m) => `[${m}]`);

/** Loose check that a typed / imported full number has the shape of the template */
export function looksLikeTemplate(template: string, value: string): boolean {
  let re = '';
  let last = 0;
  for (const m of template.matchAll(TOKEN)) {
    re += esc(template.slice(last, m.index));
    re += m[1].startsWith('SEQ') ? '\\d+' : m[1] === 'PREFIX' ? '.+?' : '.+?';
    last = (m.index ?? 0) + m[0].length;
  }
  re += esc(template.slice(last));
  try { return new RegExp(`^${re}$`).test(value); } catch { return false; }
}

export async function docPrefixes(cfg: DocNumberCfg): Promise<string[]> {
  if (cfg.prefixLookup?.sheetId && cfg.prefixLookup.columnId) return lookupValues({ ...cfg.prefixLookup, parent: null }, null);
  return (cfg.prefixes ?? []).filter(Boolean);
}

export interface DocRequest { prefix: string | null; date: { y: number; m: number; d: number } }

/**
 * Next numbers for a batch of requests (one lock per sheet+column, so concurrent users never get the same number).
 * Must run inside a transaction.
 */
export async function nextDocNumbers(tx: Tx, sheetId: string, def: ColumnDef, cfg: DocNumberCfg, reqs: DocRequest[]): Promise<string[]> {
  await q(`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = @res, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 15000; SELECT @r AS r`,
    { res: `docno:${sheetId}:${def.column_id}` }, tx);
  const counters = new Map<string, number>(); // text-with-placeholder -> highest sequence handed out / found
  const out: string[] = [];
  const hasSeq = seqCount(cfg.template) > 0;
  for (const r of reqs) {
    const skeleton = render(cfg.template, r.prefix, r.date, null);
    if (!hasSeq) { out.push(skeleton); continue; }
    if (!counters.has(skeleton)) {
      const [pre, ...rest] = skeleton.split('\u0000');
      const post = rest.join('');
      // rows that start/end like this skeleton – deleted rows included so a number is never reused
      const rows = await q(
        `SELECT c.value_text FROM Cells c JOIN Rows r ON r.row_id = c.row_id
         WHERE r.sheet_id = @s AND c.column_id = @c AND c.value_text LIKE @pat`,
        { s: T.uuid(sheetId), c: T.uuid(def.column_id), pat: T.text(`${likeEsc(pre)}%${likeEsc(post)}`) }, tx);
      const re = new RegExp(`^${esc(pre)}(\\d+)${esc(post)}$`);
      let max = 0;
      for (const row of rows) { const m = re.exec(String(row.value_text)); if (m) max = Math.max(max, Number(m[1])); }
      counters.set(skeleton, max);
    }
    const next = counters.get(skeleton)! + 1;
    counters.set(skeleton, next);
    const w = Number(/\{SEQ:(\d{1,2})\}/.exec(cfg.template)?.[1] ?? 1);
    out.push(skeleton.replace('\u0000', pad(next, w)));
  }
  return out;
}

export type DocRaw =
  | { ok: true; kind: 'value'; value: string | null }
  | { ok: true; kind: 'generate'; prefix: string | null }
  | { ok: false; error: string };

/**
 * Decides what a submitted value means:
 *  - a bare prefix (CSM)        -> generate a new number
 *  - a full number of this shape -> keep as typed (imports from another system, manual corrections)
 *  - empty on create without a {PREFIX} token -> generate
 */
export function interpretDocRaw(def: ColumnDef, cfg: DocNumberCfg, raw: unknown, prefixes: string[], mode: 'create' | 'update'): DocRaw {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  const name = def.column_name;
  if (!text) {
    if (!hasPrefixToken(cfg.template)) return mode === 'create' ? { ok: true, kind: 'generate', prefix: null } : def.is_required ? { ok: false, error: `"${name}" จำเป็นต้องกรอก` } : { ok: true, kind: 'value', value: null };
    if (mode === 'create' && def.is_required) return { ok: false, error: `กรุณาเลือกหัวเลขของ "${name}"` };
    return { ok: true, kind: 'value', value: null };
  }
  const hit = prefixes.find((p) => p.toLowerCase() === text.toLowerCase());
  if (hit && hasPrefixToken(cfg.template)) return { ok: true, kind: 'generate', prefix: hit };
  if (looksLikeTemplate(cfg.template, text)) return { ok: true, kind: 'value', value: text };
  const example = render(cfg.template, prefixes[0] ?? 'ABC', dateParts(null), 1).replace('\u0000', '1');
  return { ok: false, error: `"${name}" ต้องเลือกหัวเลขจากรายการ หรือกรอกเลขที่ในรูปแบบ เช่น ${example}` };
}

/** Date for the date tokens of a new row: the configured date column of the same row, else today */
export const docDate = (cfg: DocNumberCfg, rowRaw: Record<string, unknown>) => {
  const v = cfg.dateColumnId ? rowRaw[cfg.dateColumnId] : null;
  return dateParts(typeof v === 'string' ? v : null);
};

/** Validates a doc-number definition when the column is saved */
export async function assertDocNumberConfig(user: AuthUser, ownSheetId: string, cfg: DocNumberCfg) {
  if (seqCount(cfg.template) > 1) throw badRequest('รูปแบบเลขที่ใส่ {SEQ} ได้เพียงจุดเดียว');
  if (hasPrefixToken(cfg.template) && !(cfg.prefixes?.length) && !cfg.prefixLookup?.columnId)
    throw badRequest('รูปแบบมี {PREFIX} กรุณากำหนดรายการหัวเลข หรือเลือกดึงจากตารางอื่น');
  if (cfg.prefixLookup?.columnId) await assertLookupConfig(user, ownSheetId, null, { ...cfg.prefixLookup, parent: null });
  if (cfg.dateColumnId) {
    const own = await loadColumns(ownSheetId);
    if (!own.some((c) => c.column_id === cfg.dateColumnId && (c.data_type === 'date' || c.data_type === 'datetime'))) throw badRequest('ไม่พบคอลัมน์วันที่ที่ใช้อ้างอิงในตารางนี้');
  }
}
