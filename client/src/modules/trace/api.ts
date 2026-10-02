import { get, post } from '@/api/client';

export interface TraceNode { rowId: string; rowNo: number; sheetId: string; sheetName: string; fileId: string; fileName: string; createdAt: string; restricted: boolean; label: string | null; fields: { name: string; type: string; value: string }[] }
export interface TraceLink { id: number; parent: string; child: string; qty: number | null; role: string; lvl: number; dir: 'back' | 'forward' }
export interface TraceData { startRowId: string; nodes: TraceNode[]; links: TraceLink[]; truncated: boolean }
export const traceApi = {
  find: (sheetId: string, columnId: string, value: string) => post<{ rowId: string; rowNo: number }>(`/sheets/${sheetId}/find`, { columnId, value }),
  trace: (rowId: string, dir: 'back' | 'forward' | 'both', depth = 8) => get<TraceData>(`/trace/rows/${rowId}`, { dir, depth }),
};

/** level of each node: parents of the start row are -1, -2 …; what was made from it +1, +2 … */
export function levelsOf(d: TraceData): Map<string, number> {
  const lv = new Map<string, number>([[d.startRowId, 0]]);
  for (const l of d.links) {
    const other = l.dir === 'back' ? l.parent : l.child;
    const v = l.dir === 'back' ? -l.lvl : l.lvl;
    const cur = lv.get(other);
    if (cur === undefined || Math.abs(v) < Math.abs(cur)) lv.set(other, v);
  }
  return lv;
}
