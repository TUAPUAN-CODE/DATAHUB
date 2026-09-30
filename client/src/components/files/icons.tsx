import { useMemo } from 'react';
import { Folder, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Spreadsheet file glyph tinted with the file color */
export function FileGlyph({ color = '#16A34A', size = 36, locked, className }: { color?: string; size?: number; locked?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center rounded-[10px] text-white shadow-sm', className)}
      style={{ width: size, height: size, background: color }}>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
        <path d="M3.5 9.5h17M3.5 14.5h17M10 4v16" />
      </svg>
      {locked && (
        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-surface text-muted ring-1 ring-line">
          <Lock className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

export function FolderGlyph({ color = '#1552F0', size = 36, locked }: { color?: string; size?: number; locked?: boolean }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-[10px]" style={{ width: size, height: size, background: `${color}1A`, color }}>
      <Folder style={{ width: size * 0.55, height: size * 0.55 }} fill="currentColor" fillOpacity={0.25} />
      {locked && (
        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-surface text-muted ring-1 ring-line">
          <Lock className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

/** Deterministic mini-spreadsheet preview (SharePoint-like activity thumbnail) */
export function FileThumb({ id, color = '#16A34A', className }: { id: string; color?: string; className?: string }) {
  const cells = useMemo(() => {
    let s = 0;
    for (const ch of id) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const cols = 5 + Math.floor(r() * 3);
    const widths = Array.from({ length: cols }, () => 22 + r() * 30);
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = 212 / total;
    const hl = Array.from({ length: 10 }, () => r() > 0.8);
    const hlCol = Math.floor(r() * cols);
    return { widths: widths.map((w) => w * scale), hl, hlCol };
  }, [id]);
  let x = 14;
  return (
    <svg viewBox="0 0 240 132" className={cn('h-full w-full', className)} aria-hidden>
      <rect width="240" height="132" fill="rgb(var(--c-bg))" />
      <rect x="10" y="10" width="220" height="130" rx="6" fill="var(--tableCell-bg)" stroke="var(--tableCell-border)" />
      <rect x="10" y="10" width="220" height="14" rx="6" fill={color} opacity=".16" />
      {cells.widths.map((w, i) => {
        const cx = x;
        x += w;
        return (
          <g key={i}>
            <line x1={cx + w} y1="10" x2={cx + w} y2="132" stroke="var(--tableCell-border)" />
            <rect x={cx + 3} y="15" width={Math.max(6, w * 0.55)} height="4" rx="2" fill={color} opacity=".7" />
            {Array.from({ length: 10 }).map((_, j) => (
              <rect key={j} x={cx + 3} y={30 + j * 10} width={Math.max(4, w * (0.3 + ((i * 7 + j * 3) % 5) / 10))} height="3" rx="1.5"
                fill={i === cells.hlCol && cells.hl[j] ? '#F59E0B' : 'rgb(var(--c-muted))'} opacity={i === cells.hlCol && cells.hl[j] ? 0.9 : 0.28} />
            ))}
          </g>
        );
      })}
      {Array.from({ length: 10 }).map((_, j) => <line key={j} x1="10" x2="230" y1={26 + j * 10} y2={26 + j * 10} stroke="var(--tableCell-border)" strokeWidth=".6" />)}
    </svg>
  );
}
