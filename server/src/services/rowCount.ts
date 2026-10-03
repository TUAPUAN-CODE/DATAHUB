import { q1, T } from '../config/db';
import { env } from '../config/env';

/**
 * Counting the rows of a big sheet on every page load is the most expensive part of paging (the table is scanned each time).
 * Totals of sheets with ≥ CACHE_FROM rows are remembered for a few seconds, and dropped as soon as rows are added / removed.
 */
const CACHE_FROM = 50_000;
const TTL_MS = 20_000;
const cache = new Map<string, { at: number; total: number; sheet: string }>();

export const invalidateRowCount = (sheetId: string) => {
  const s = sheetId.toLowerCase();
  for (const [k, v] of cache) if (v.sheet === s) cache.delete(k);
};

export function cachedTotal(sheetId: string, key: string): number | null {
  const hit = cache.get(`${sheetId.toLowerCase()}|${key}`);
  return hit && Date.now() - hit.at < TTL_MS ? hit.total : null;
}
export function rememberTotal(sheetId: string, key: string, total: number) {
  if (total < CACHE_FROM) return;
  if (cache.size > 500) cache.clear();
  cache.set(`${sheetId.toLowerCase()}|${key}`, { at: Date.now(), total, sheet: sheetId.toLowerCase() });
}

/** Rows of the sheet (no filter) — cheap: one seek + range on IX_Rows_Sheet */
export async function sheetRowCount(sheetId: string): Promise<number> {
  const hit = cachedTotal(sheetId, '*');
  if (hit !== null) return hit;
  const r = await q1(`SELECT COUNT_BIG(*) AS n FROM Rows WHERE sheet_id = @s AND is_deleted = 0`, { s: T.uuid(sheetId) });
  const n = Number(r?.n ?? 0);
  rememberTotal(sheetId, '*', n);
  return n;
}

/** A sheet this big needs a filter before a free-text search (a LIKE '%…%' reads every cell of the table) */
export const BIG_SHEET_ROWS = Math.max(10_000, Number(process.env.BIG_SHEET_ROWS) || 300_000);
void env;
