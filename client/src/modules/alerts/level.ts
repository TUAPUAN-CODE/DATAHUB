import type { AlertCfg, AlertLevel, CellValue, Column } from '@/types';

export const DEFAULT_ALERT_LEVELS: AlertLevel[] = [
  { atPct: 50, color: '#FACC15', label: 'ใกล้เกินเวลา' },
  { atPct: 100, color: '#EF4444', label: 'เกินเวลา' },
];
export const DEFAULT_NORMAL_COLOR = '#22C55E';

const toMs = (v: CellValue | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
};

/** elapsed / limit in %, or null when it can not be told (no start, no limit). An open row (no end) is measured against `now`. */
export function alertRatio(cfg: AlertCfg, values: Record<string, CellValue>, now: number): number | null {
  const start = toMs(values[cfg.startColumnId]);
  const limit = Number(values[cfg.limitColumnId]);
  if (start === null || !Number.isFinite(limit) || limit <= 0) return null;
  const end = cfg.endColumnId ? toMs(values[cfg.endColumnId]) : null;
  const elapsedMin = ((end ?? now) - start) / 60000;
  return (elapsedMin / limit) * 100;
}

/** The colour of the highest level reached; the normal colour below the first level; null when unknown */
export function alertColor(cfg: AlertCfg, values: Record<string, CellValue>, now: number): { color: string; label: string | null; pct: number } | null {
  const pct = alertRatio(cfg, values, now);
  if (pct === null) return null;
  const levels = [...cfg.levels].sort((a, b) => a.atPct - b.atPct);
  let hit: AlertLevel | null = null;
  for (const l of levels) if (pct >= l.atPct) hit = l;
  if (hit) return { color: hit.color, label: hit.label ?? null, pct };
  return cfg.normalColor === null ? null : { color: cfg.normalColor ?? DEFAULT_NORMAL_COLOR, label: 'ปกติ', pct };
}

export const alertColumns = (cols: Column[]) => cols.filter((c) => c.validation?.alert);

/** a pale background of the colour so the text stays readable */
export const tint = (hex: string, alpha = 0.28) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
