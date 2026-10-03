import { DateV, EvalCtx, FormulaEvalError, FValue, isDateV } from './types';

export const DAY_MS = 86_400_000;

export function toNumber(v: FValue): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const t = v.replace(/,/g, '').trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return v.ms / DAY_MS; // date as days since 1970
}

export function toText(v: FValue): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  return v.kind === 'date' ? new Date(v.ms).toISOString().slice(0, 10) : new Date(v.ms).toISOString();
}

export function toBool(v: FValue): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['true', '1', 'yes', 'ใช่'].includes(v.trim().toLowerCase());
  return true;
}

export function toDate(v: FValue): DateV | null {
  if (v === null) return null;
  if (isDateV(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (d) return { kind: 'date', ms: Date.UTC(+d[1], +d[2] - 1, +d[3]) };
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : { kind: 'datetime', ms };
  }
  return null;
}

/** wall-clock fields of a date value (a `date` has no time zone; a `datetime` is shown in the app time zone) */
export function parts(d: DateV, ctx: Pick<EvalCtx, 'tzOffsetMinutes'>) {
  const t = new Date(d.ms + (d.kind === 'datetime' ? ctx.tzOffsetMinutes * 60_000 : 0));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds(), dow: t.getUTCDay() };
}

export const UNIT_MS: Record<string, number> = {
  second: 1000, seconds: 1000, s: 1000,
  minute: 60_000, minutes: 60_000, n: 60_000,
  hour: 3_600_000, hours: 3_600_000, h: 3_600_000,
  day: DAY_MS, days: DAY_MS, d: DAY_MS,
  week: 7 * DAY_MS, weeks: 7 * DAY_MS, w: 7 * DAY_MS,
};
export const unitMs = (u: FValue): number => {
  const k = toText(u).trim().toLowerCase();
  const ms = UNIT_MS[k];
  if (!ms) throw new FormulaEvalError(`หน่วยเวลา "${k}" ไม่รู้จัก (ใช้ second / minute / hour / day / week)`);
  return ms;
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** tokens: yyyy yy BBBB (พ.ศ.) MM dd HH mm ss */
export function formatDate(d: DateV, fmt: string, ctx: Pick<EvalCtx, 'tzOffsetMinutes'>): string {
  const p = parts(d, ctx);
  return fmt.replace(/yyyy|yy|BBBB|MM|dd|HH|mm|ss/g, (t) => {
    switch (t) {
      case 'yyyy': return String(p.y);
      case 'yy': return pad(p.y % 100);
      case 'BBBB': return String(p.y + 543);
      case 'MM': return pad(p.m);
      case 'dd': return pad(p.d);
      case 'HH': return pad(p.h);
      case 'mm': return pad(p.mi);
      default: return pad(p.s);
    }
  });
}
