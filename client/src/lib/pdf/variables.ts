import type { PdfTemplate } from './types';

/**
 * Variables usable in any text as {{name}}. Each variable is a small independent definition: register another one
 * (e.g. a company-specific number) with registerVariable() and it appears in the designer and in every export.
 * {{page}} / {{pages}} are resolved per page by the document builder.
 */
export interface VarCtx {
  now: Date;
  fileName: string;
  sheetName: string;
  user: string;
  rowCount: number;
  /** values typed into the export dialog (template.prompts) */
  prompts: Record<string, string>;
  settings?: PdfTemplate['settings'];
}
export interface VariableDef { key: string; label: string; resolve: (c: VarCtx) => string }

const defs = new Map<string, VariableDef>();
export const registerVariable = (d: VariableDef) => { defs.set(d.key.toLowerCase(), d); };

const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtDatePdf = (d: Date, be = false) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear() + (be ? 543 : 0)}`;
const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const toMinutes = (hhmm: string | undefined, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};

/** Day / night shift for a moment in time, using the template's shift settings (default 06:00–18:00 = DS) */
export function shiftOf(now: Date, s?: NonNullable<PdfTemplate['settings']>['shift']): string {
  const from = toMinutes(s?.dayStart, 6 * 60);
  const to = toMinutes(s?.nightStart, 18 * 60);
  const t = now.getHours() * 60 + now.getMinutes();
  const day = from <= to ? t >= from && t < to : t >= from || t < to;
  return day ? s?.dayLabel || 'DS' : s?.nightLabel || 'NS';
}

for (const d of [
  { key: 'date', label: 'วันที่พิมพ์ (ค.ศ.)', resolve: (c: VarCtx) => fmtDatePdf(c.now) },
  { key: 'dateBE', label: 'วันที่พิมพ์ (พ.ศ.)', resolve: (c: VarCtx) => fmtDatePdf(c.now, true) },
  { key: 'time', label: 'เวลา', resolve: (c: VarCtx) => fmtTime(c.now) },
  { key: 'datetime', label: 'วันที่และเวลา', resolve: (c: VarCtx) => `${fmtDatePdf(c.now)} ${fmtTime(c.now)}` },
  { key: 'shift', label: 'กะ (DS / NS ตามเวลาพิมพ์)', resolve: (c: VarCtx) => shiftOf(c.now, c.settings?.shift) },
  { key: 'file', label: 'ชื่อไฟล์', resolve: (c: VarCtx) => c.fileName },
  { key: 'sheet', label: 'ชื่อชีต', resolve: (c: VarCtx) => c.sheetName },
  { key: 'user', label: 'ผู้พิมพ์', resolve: (c: VarCtx) => c.user },
  { key: 'rows', label: 'จำนวนแถวในตาราง', resolve: (c: VarCtx) => c.rowCount.toLocaleString() },
]) registerVariable(d);

export function resolveVariables(c: VarCtx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs.values()) out[d.key] = d.resolve(c);
  for (const [k, v] of Object.entries(c.prompts)) { out[k] = v; out[`prompt.${k}`] = v; } // a prompt may override a built-in name on purpose
  return out;
}

/** For the designer's token chips */
export const listTokens = (prompts: PdfTemplate['prompts'] = []): { token: string; label: string }[] => [
  { token: '{{page}}', label: 'เลขหน้า' },
  { token: '{{pages}}', label: 'จำนวนหน้าทั้งหมด' },
  ...[...defs.values()].map((d) => ({ token: `{{${d.key}}}`, label: d.label })),
  ...prompts.filter((p) => p.key).map((p) => ({ token: `{{${p.key}}}`, label: `${p.label || p.key} (ถามตอน export)` })),
];

/** Starting value of an export-dialog field: a fixed text or one of @today / @shift / @user */
export function promptDefault(p: { default?: string }, ctx: Pick<VarCtx, 'now' | 'user' | 'settings'>): string {
  const d = p.default ?? '';
  if (d === '@today') return `${ctx.now.getFullYear()}-${pad2(ctx.now.getMonth() + 1)}-${pad2(ctx.now.getDate())}`;
  if (d === '@shift') return shiftOf(ctx.now, ctx.settings?.shift);
  if (d === '@user') return ctx.user;
  return d;
}

/** Replaces {{tokens}} (case-insensitive); unknown tokens vanish. `extra` (e.g. the values of the current row) wins. */
export function fillTokens(text: string, vars: Record<string, string>, extra?: Record<string, string>): string {
  return (text ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, k: string) => {
    const key = k.toLowerCase();
    if (extra) { const hit = Object.keys(extra).find((x) => x.toLowerCase() === key); if (hit !== undefined) return extra[hit]; }
    const hit = Object.keys(vars).find((x) => x.toLowerCase() === key);
    return hit !== undefined ? vars[hit] : '';
  });
}
