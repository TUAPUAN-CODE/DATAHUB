import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { levelsOf, TraceData, TraceNode } from './api';

const W = 210, H = 78, GX = 70, GY = 16;

/** Layered graph: what went in on the left, the start row in the middle, what it went into on the right */
export function TraceGraph({ data, selected, onSelect }: { data: TraceData; selected: string | null; onSelect: (n: TraceNode) => void }) {
  const layout = useMemo(() => {
    const lv = levelsOf(data);
    const byLevel = new Map<number, TraceNode[]>();
    for (const n of data.nodes) {
      const l = lv.get(n.rowId);
      if (l === undefined) continue;
      if (!byLevel.has(l)) byLevel.set(l, []);
      byLevel.get(l)!.push(n);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const min = levels[0] ?? 0;
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 1;
    for (const l of levels) {
      const list = byLevel.get(l)!.sort((a, b) => a.rowNo - b.rowNo);
      maxRows = Math.max(maxRows, list.length);
      list.forEach((n, i) => pos.set(n.rowId, { x: (l - min) * (W + GX), y: i * (H + GY) }));
    }
    // centre every column vertically
    for (const l of levels) {
      const list = byLevel.get(l)!;
      const off = ((maxRows - list.length) * (H + GY)) / 2;
      list.forEach((n) => { const p = pos.get(n.rowId)!; p.y += off; });
    }
    return { pos, width: levels.length * (W + GX) - GX, height: maxRows * (H + GY) - GY };
  }, [data]);

  const seen = new Set<number>();
  const edges = data.links.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  return (
    <div className="overflow-auto rounded-xl border border-line bg-surface p-4">
      <div className="relative" style={{ width: Math.max(layout.width, W), height: Math.max(layout.height, H) }}>
        <svg className="absolute inset-0" width={Math.max(layout.width, W)} height={Math.max(layout.height, H)}>
          {edges.map((l) => {
            const a = layout.pos.get(l.parent), b = layout.pos.get(l.child);
            if (!a || !b) return null;
            const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
            return (
              <g key={l.id} className="text-muted">
                <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
                {l.qty !== null && <text x={mx} y={(y1 + y2) / 2 - 4} textAnchor="middle" fontSize={11} fill="currentColor">{Math.round(l.qty * 1e3) / 1e3}</text>}
              </g>
            );
          })}
        </svg>
        {data.nodes.map((n) => {
          const p = layout.pos.get(n.rowId);
          if (!p) return null;
          const isStart = n.rowId === data.startRowId;
          return (
            <button key={n.rowId} type="button" onClick={() => onSelect(n)} style={{ left: p.x, top: p.y, width: W, height: H }}
              className={cn('absolute overflow-hidden rounded-xl border bg-app p-2 text-left text-xs shadow-sm transition hover:border-primary/60',
                isStart ? 'border-primary ring-2 ring-primary/30' : 'border-line', selected === n.rowId && 'ring-2 ring-primary')}>
              {n.restricted ? <p className="flex items-center gap-1 text-muted"><Lock className="h-3.5 w-3.5" />ไม่มีสิทธิ์ดูข้อมูล</p>
                : <p className="truncate text-[13px] font-semibold">{n.label ?? `แถว #${n.rowNo}`}</p>}
              <p className="truncate text-muted">#{n.rowNo} · {n.sheetName}</p>
              {!n.restricted && <p className="truncate text-muted">{n.fields.slice(0, 2).map((f) => `${f.name}: ${f.value}`).join(' · ')}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
