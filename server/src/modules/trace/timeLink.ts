/** Pure rules of "link two tables by time" (kept apart from the database so they can be tested) */
export interface TimeLink {
  id: string; name: string;
  /** the other table */ targetSheetId: string;
  aStartColumnId: string; aEndColumnId?: string | null; aKeyColumnId?: string | null;
  bStartColumnId: string; bEndColumnId?: string | null; bKeyColumnId?: string | null;
  /** how many minutes apart still counts as overlapping (default 0) */ toleranceMin?: number | null;
  /** the other table's rows are looked up from this many hours before the start (longest span a row can have; default 72) */ windowHours?: number | null;
}

/** [start, end] of a row; an unfinished row (no end) runs until `now`. Null when there is no start. */
export function interval(start: Date | null, end: Date | null, now: Date): { s: number; e: number } | null {
  if (!start) return null;
  const s = start.getTime();
  const e = (end ?? now).getTime();
  return { s, e: Math.max(s, e) };
}

/** minutes the two intervals overlap (0 = they only touch / are apart but within tolerance) and whether they count as linked */
export function overlap(a: { s: number; e: number }, b: { s: number; e: number }, toleranceMin = 0): { linked: boolean; minutes: number } {
  const tol = Math.max(0, toleranceMin) * 60_000;
  const minutes = Math.max(0, Math.min(a.e, b.e) - Math.max(a.s, b.s)) / 60_000;
  const linked = a.s <= b.e + tol && b.s <= a.e + tol;
  return { linked, minutes: Math.round(minutes * 10) / 10 };
}
