export interface Level { atPct: number; color: string; label?: string | null }
export interface NotifyCfg {
  /** LINE userId / groupId / roomId */ targetId: string;
  /** indexes into the levels sorted by atPct; empty / missing = every level */ levelIdx?: number[] | null;
  /** columns of the row shown in the message (e.g. material code) */ labelColumnIds?: string[] | null;
}
export interface AlertCfgServer { startColumnId: string; endColumnId?: string | null; limitColumnId: string; levels: Level[]; normalColor?: string | null; notify?: NotifyCfg | null }

export const sortedLevels = (levels: Level[]) => [...levels].sort((a, b) => a.atPct - b.atPct);

/** elapsed / limit in % (null when it can not be told) */
export function ratioPct(startMs: number, endMs: number | null, nowMs: number, limitMin: number): number | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(limitMin) || limitMin <= 0) return null;
  return (((endMs ?? nowMs) - startMs) / 60000 / limitMin) * 100;
}

/** Highest level (index in the sorted list) reached by `pct` that the manager asked to be told about; -1 when none */
export function levelToNotify(levels: Level[], pct: number, only?: number[] | null): number {
  const s = sortedLevels(levels);
  let hit = -1;
  s.forEach((l, i) => { if (pct >= l.atPct && (!only?.length || only.includes(i))) hit = i; });
  return hit;
}

export const fmtDuration = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m} น.`;
};

export interface AlertItem { rowNo: number; pct: number; levelLabel: string; elapsedMin: number; limitMin: number; startedAt: string; labels: string[] }

/** One LINE text for all rows of a column that crossed a level in this run (LINE text limit is 5000 chars) */
export function buildMessage(title: string, items: AlertItem[], link: string | null): string {
  const lines: string[] = [`⚠️ ${title}`];
  for (const it of items) {
    lines.push(`• แถว ${it.rowNo}${it.labels.length ? ` | ${it.labels.join(' | ')}` : ''}`);
    lines.push(`  ${it.levelLabel} ${Math.round(it.pct)}% (ผ่านไป ${fmtDuration(it.elapsedMin)} / มาตรฐาน ${fmtDuration(it.limitMin)}) เริ่ม ${it.startedAt}`);
  }
  if (link) lines.push('', link);
  let text = lines.join('\n');
  if (text.length > 4800) text = `${text.slice(0, 4750)}\n… (ตัดข้อความ ดูต่อในระบบ)`;
  return text;
}
