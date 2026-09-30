import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDebounce } from '@/hooks';
import { Popover } from './Popover';

export interface SSOption { value: string; label: string; sub?: string; color?: string | null; icon?: ReactNode }

/** Searchable single-select. Pass `load` for server-side search, or `options` for local filtering. */
export function SearchSelect({
  value, onChange, options, load, placeholder = 'เลือก…', searchPlaceholder = 'ค้นหา…', className, disabled, renderValue, width,
}: {
  value: string | null | undefined; onChange: (v: string, opt: SSOption) => void; options?: SSOption[]; load?: (q: string) => Promise<SSOption[]>;
  placeholder?: string; searchPlaceholder?: string; className?: string; disabled?: boolean; renderValue?: (o: SSOption | undefined) => ReactNode; width?: number;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const [remote, setRemote] = useState<SSOption[]>([]);
  const [known, setKnown] = useState<SSOption | undefined>();
  const [hi, setHi] = useState(0);

  useEffect(() => {
    if (!open || !load) return;
    let live = true;
    load(dq).then((r) => live && setRemote(r)).catch(() => undefined);
    return () => { live = false; };
  }, [dq, open, load]);

  const list = useMemo(() => {
    if (load) return remote;
    const s = q.trim().toLowerCase();
    return (options ?? []).filter((o) => !s || o.label.toLowerCase().includes(s) || o.sub?.toLowerCase().includes(s));
  }, [options, remote, q, load]);
  const current = (options ?? remote).find((o) => o.value === value) ?? (known?.value === value ? known : undefined);

  const pick = (o: SSOption) => { setKnown(o); onChange(o.value, o); setOpen(false); setQ(''); };

  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((v) => !v)}
        className={cn('ds-input flex h-10 w-full items-center gap-2 px-3 text-left text-sm disabled:opacity-50', className)}>
        <span className="min-w-0 flex-1 truncate">
          {renderValue ? renderValue(current) : current ? (
            <span className="inline-flex items-center gap-2">{current.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: current.color }} />}{current.label}</span>
          ) : <span className="text-muted">{placeholder}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn.current} width={width ?? Math.max(240, btn.current?.offsetWidth ?? 240)}>
        <div className="border-b border-line p-2">
          <div className="flex items-center gap-2 rounded-lg bg-ink/5 px-2.5">
            <Search className="h-4 w-4 text-muted" />
            <input autoFocus value={q} placeholder={searchPlaceholder} className="h-9 w-full bg-transparent text-sm outline-none"
              onChange={(e) => { setQ(e.target.value); setHi(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
                if (e.key === 'Enter' && list[hi]) { e.preventDefault(); pick(list[hi]); }
              }} />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {list.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted">ไม่พบรายการ</div>}
          {list.map((o, i) => (
            <button key={o.value} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(o)}
              className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm', i === hi && 'bg-ink/5')}>
              {o.icon ?? (o.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} /> : null)}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
              </span>
              {o.value === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
