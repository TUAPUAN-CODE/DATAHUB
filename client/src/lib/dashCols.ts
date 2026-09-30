import { sheetsApi } from '@/api/endpoints';
import type { Column } from '@/types';

const cache = new Map<string, Promise<Column[]>>();
/** Columns of a sheet, cached for the session (used by dashboard config panels and slicers) */
export function loadCols(sheetId: string, force = false): Promise<Column[]> {
  if (force) cache.delete(sheetId);
  if (!cache.has(sheetId)) cache.set(sheetId, sheetsApi.get(sheetId).then((d) => d.columns).catch(() => { cache.delete(sheetId); return []; }));
  return cache.get(sheetId)!;
}
