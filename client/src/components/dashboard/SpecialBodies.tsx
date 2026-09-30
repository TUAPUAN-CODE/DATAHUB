import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { rowsApi } from '@/api/endpoints';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/cn';
import { loadCols } from '@/lib/dashCols';
import { fmtNumber } from '@/lib/format';
import type { Column, ColumnFilter, DataSource, Widget, WidgetData } from '@/types';
import { Popover } from '../ui/Popover';
import { useDash, withSlicers } from './dashContext';
import { useWidgetData } from './useWidgetData';

/* ------------------------------------------------------------------ */
/* Slicer (filter control)                                             */
/* ------------------------------------------------------------------ */
export const SLICER_MODES: { value: string; label: string; hint?: string }[] = [
  { value: 'dropdown_search', label: 'Dropdown + ค้นหา', hint: 'เลือกหลายค่าได้ มีช่องค้นหาใน dropdown' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'list', label: 'รายการ (ติ๊กเลือก)' },
  { value: 'chips', label: 'ปุ่มเลือก' },
  { value: 'radio', label: 'ตัวเลือกเดียว (Radio)' },
  { value: 'search', label: 'ช่องค้นหาข้อความ' },
  { value: 'range', label: 'ช่วงตัวเลข (Min–Max)' },
  { value: 'date', label: 'ช่วงวันที่' },
];

type Item = { value: any; label: string; count: number };

function useSlicerItems(ds: DataSource | null, col: Column | undefined, enabled: boolean) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !ds?.sheetId || !col) { setItems([]); return; }
    let live = true;
    setLoading(true);
    rowsApi.distinct(ds.sheetId, { columnId: col.id, filters: [], limit: 500 })
      .then((r) => {
        if (!live) return;
        const label = (v: any) => (col.dataType === 'boolean' ? (v ? 'ใช่' : 'ไม่ใช่') : col.options.find((o) => o.value === v)?.label ?? String(v));
        setItems(r.items.map((i) => ({ value: i.value, label: label(i.value), count: i.count })));
      })
      .catch(() => live && setItems([]))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ds?.sheetId, col?.id, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, loading };
}

function DropdownSlicer({ items, selected, multi, search, placeholder, onChange }: {
  items: Item[]; selected: any[]; multi: boolean; search: boolean; placeholder: string; onChange: (v: any[]) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return items.filter((i) => !s || i.label.toLowerCase().includes(s)); }, [items, q]);
  const isSel = (v: any) => selected.some((x) => x === v);
  const toggle = (v: any) => {
    if (!multi) { onChange(isSel(v) ? [] : [v]); setOpen(false); return; }
    onChange(isSel(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const text = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.map((v) => items.find((i) => i.value === v)?.label ?? String(v)).join(', ') : `เลือกแล้ว ${selected.length} รายการ`;
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} onMouseDown={(e) => e.stopPropagation()}
        className={cn('flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-left text-sm', selected.length ? 'text-ink' : 'text-muted')}>
        <span className="min-w-0 flex-1 truncate">{text}</span>
        {selected.length > 0 && <span role="button" tabIndex={0} aria-label="ล้างตัวกรอง" onClick={(e) => { e.stopPropagation(); onChange([]); }} className="rounded p-0.5 hover:bg-ink/10"><X className="h-3.5 w-3.5" /></span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <Popover open={open} onClose={() => { setOpen(false); setQ(''); }} anchor={btn.current} width={Math.max(240, btn.current?.offsetWidth ?? 240)}>
        {search && (
          <div className="border-b border-line p-2">
            <div className="flex items-center gap-2 rounded-lg bg-ink/5 px-2.5">
              <Search className="h-4 w-4 text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา…" className="h-9 w-full bg-transparent text-sm outline-none" />
              {q && <button onClick={() => setQ('')} aria-label="ล้างคำค้น"><X className="h-3.5 w-3.5 text-muted" /></button>}
            </div>
          </div>
        )}
        {multi && (
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
            <button className="text-primary hover:underline" onClick={() => onChange([...new Set([...selected, ...list.map((i) => i.value)])])}>เลือกทั้งหมด{q ? 'ที่ค้นเจอ' : ''}</button>
            <button className="text-muted hover:text-ink" onClick={() => onChange([])}>ล้าง</button>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {list.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted">ไม่พบรายการ</p>}
          {list.map((i) => (
            <button key={String(i.value)} onClick={() => toggle(i.value)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-ink/5">
              <span className={cn('grid h-4 w-4 shrink-0 place-items-center border', multi ? 'rounded' : 'rounded-full', isSel(i.value) ? 'border-primary bg-primary text-white' : 'border-line')}>
                {isSel(i.value) && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{i.label}</span>
              <span className="text-xs text-muted tabular-nums">{i.count}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

export function SlicerBody({ w, editing }: { w: Widget; editing?: boolean }) {
  const { slicers, setSlicer } = useDash();
  const ds = w.dataSource;
  const cfg = w.config;
  const mode: string = cfg.mode ?? 'dropdown_search';
  const [col, setCol] = useState<Column | undefined>();
  useEffect(() => {
    if (!ds?.sheetId || !ds.xColumnId) { setCol(undefined); return; }
    let live = true;
    void loadCols(ds.sheetId).then((cs) => live && setCol(cs.find((c) => c.id === ds.xColumnId)));
    return () => { live = false; };
  }, [ds?.sheetId, ds?.xColumnId]);
  const listMode = ['dropdown_search', 'dropdown', 'list', 'chips', 'radio'].includes(mode);
  const { items, loading } = useSlicerItems(ds, col, listMode);
  const cur = slicers[w.id] ?? null;
  const selected: any[] = cur?.values ?? [];
  const multi = cfg.multi !== false && mode !== 'radio';
  const set = (f: ColumnFilter | null) => setSlicer(w.id, f);
  const setValues = (v: any[]) => set(v.length && col ? { columnId: col.id, mode: 'include', values: v } : null);

  if (!ds?.sheetId || !ds.xColumnId || !col)
    return <p className="grid h-full place-items-center text-center text-xs opacity-60">{editing ? 'เลือกคอลัมน์ที่จะใช้กรองที่แผง “ข้อมูล”' : 'ยังไม่ได้ตั้งค่า'}</p>;

  let body: React.ReactNode = null;
  if (mode === 'dropdown_search' || mode === 'dropdown')
    body = <DropdownSlicer items={items} selected={selected} multi={multi} search={mode === 'dropdown_search'} placeholder={cfg.placeholder || `เลือก ${col.name}`} onChange={setValues} />;
  else if (mode === 'chips')
    body = (
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => {
          const on = selected.includes(i.value);
          return <button key={String(i.value)} onMouseDown={(e) => e.stopPropagation()} onClick={() => setValues(on ? selected.filter((x) => x !== i.value) : multi ? [...selected, i.value] : [i.value])}
            className={cn('rounded-full border px-3 py-1 text-xs transition-colors', on ? 'border-primary bg-primary text-white' : 'border-line hover:border-primary/50')}>{i.label}</button>;
        })}
      </div>
    );
  else if (mode === 'list' || mode === 'radio')
    body = (
      <div className="space-y-0.5">
        {items.map((i) => {
          const on = selected.includes(i.value);
          return (
            <button key={String(i.value)} onMouseDown={(e) => e.stopPropagation()} onClick={() => setValues(mode === 'radio' ? (on ? [] : [i.value]) : on ? selected.filter((x) => x !== i.value) : [...selected, i.value])}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-ink/5">
              <span className={cn('grid h-4 w-4 shrink-0 place-items-center border', mode === 'radio' ? 'rounded-full' : 'rounded', on ? 'border-primary bg-primary text-white' : 'border-line')}>{on && <Check className="h-3 w-3" />}</span>
              <span className="min-w-0 flex-1 truncate">{i.label}</span><span className="text-xs text-muted tabular-nums">{i.count}</span>
            </button>
          );
        })}
      </div>
    );
  else if (mode === 'search')
    body = <SearchInput value={cur?.value ?? ''} onChange={(v) => set(v ? { columnId: col.id, op: 'contains', value: v } : null)} />;
  else if (mode === 'range' || mode === 'date') {
    const type = mode === 'date' ? 'date' : 'number';
    const a = cur?.value ?? '';
    const b = cur?.value2 ?? '';
    const upd = (x: string, y: string) => set(x !== '' || y !== '' ? (x !== '' && y !== '' ? { columnId: col.id, op: 'between', value: x, value2: y } : x !== '' ? { columnId: col.id, op: 'gte', value: x } : { columnId: col.id, op: 'lte', value: y }) : null);
    // a single-bound filter keeps its value in `value`; recover the side from the op
    const lo = cur?.op === 'lte' ? '' : a;
    const hi = cur?.op === 'lte' ? a : b;
    body = (
      <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
        <input type={type} value={lo} onChange={(e) => upd(e.target.value, hi)} className="ds-input h-9 min-w-0 flex-1 px-2 text-sm" placeholder="ตั้งแต่" />
        <span className="text-muted">–</span>
        <input type={type} value={hi} onChange={(e) => upd(lo, e.target.value)} className="ds-input h-9 min-w-0 flex-1 px-2 text-sm" placeholder="ถึง" />
        {cur && <button onClick={() => set(null)} aria-label="ล้าง" className="rounded p-1 hover:bg-ink/10"><X className="h-4 w-4" /></button>}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1.5" onMouseDown={(e) => { if (!editing) e.stopPropagation(); }}>
      {cfg.showLabel !== false && <p className="flex items-center gap-2 text-xs font-medium opacity-70">{cfg.label || col.name}{cur && <button className="ml-auto text-[11px] text-primary hover:underline" onClick={() => set(null)}>ล้าง</button>}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">{loading && !items.length && listMode ? <div className="skeleton h-9 w-full" /> : body}</div>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(String(value));
  const d = useDebounce(v, 350);
  useEffect(() => { if (d !== value) onChange(d); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3" onMouseDown={(e) => e.stopPropagation()}>
      <Search className="h-4 w-4 text-muted" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="พิมพ์เพื่อค้นหา…" className="h-10 w-full bg-transparent text-sm outline-none" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Info card                                                           */
/* ------------------------------------------------------------------ */
export function CardBody({ w, refreshKey }: { w: Widget; refreshKey: number }) {
  const c = w.config;
  const ctx = useDash();
  const useValue = c.showValue && !!w.dataSource?.sheetId && (w.dataSource.series[0]?.aggregation === 'count' || !!w.dataSource.series[0]?.columnId);
  const { data } = useWidgetData('kpi', useValue ? withSlicers(ctx, w.id, w.dataSource) : null, refreshKey);
  const v = data?.series[0]?.values[0];
  const align = c.align ?? 'left';
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 overflow-hidden" style={{ textAlign: align, alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
      {c.showIcon && c.icon && <span className="mb-1 text-3xl leading-none">{c.icon}</span>}
      {c.showHeading !== false && c.heading && <p className="w-full font-semibold leading-tight" style={{ fontSize: c.headingSize ?? 20, color: c.headingColor || undefined }}>{c.heading}</p>}
      {c.showSubheading !== false && c.subheading && <p className="w-full opacity-75" style={{ fontSize: c.subheadingSize ?? 14, color: c.subheadingColor || undefined }}>{c.subheading}</p>}
      {useValue && (
        <p className="w-full font-semibold tabular-nums leading-none" style={{ fontSize: c.valueSize ?? 36, color: c.valueColor || 'rgb(var(--c-primary))' }}>
          {c.prefix}{v === null || v === undefined ? '–' : fmtNumber(v, c.decimals ?? 0)}{c.suffix}
        </p>
      )}
      {c.showBody !== false && c.body && <p className="w-full whitespace-pre-wrap break-words opacity-80" style={{ fontSize: c.bodySize ?? 13, color: c.bodyColor || undefined }}>{c.body}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Condition card: compare value A with value B                        */
/* ------------------------------------------------------------------ */
export const COMPARE_OPS: { v: string; label: string }[] = [
  { v: 'lt', label: 'A < B' }, { v: 'lte', label: 'A ≤ B' }, { v: 'gt', label: 'A > B' }, { v: 'gte', label: 'A ≥ B' }, { v: 'eq', label: 'A = B' }, { v: 'neq', label: 'A ≠ B' },
];
export const compare = (op: string, a: number, b: number) =>
  op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'eq' ? a === b : a !== b;
export const valueSourceOk = (ds: DataSource | null | undefined): ds is DataSource => !!ds?.sheetId && !!ds.series?.length && (ds.series[0].aggregation === 'count' || !!ds.series[0].columnId);

function useValue(w: Widget, ds: DataSource | null | undefined, refreshKey: number): { v: number | null | undefined; ready: boolean; error?: string } {
  const ctx = useDash();
  const st = useWidgetData('kpi', valueSourceOk(ds) ? withSlicers(ctx, w.id, ds) : null, refreshKey);
  return { v: st.data?.series[0]?.values[0], ready: !!st.data, error: st.error };
}

export function ConditionBody({ w, refreshKey, editing }: { w: Widget; refreshKey: number; editing?: boolean }) {
  const c = w.config;
  const a = useValue(w, w.dataSource, refreshKey);
  const b = useValue(w, c.b as DataSource | undefined, refreshKey);
  if (!valueSourceOk(w.dataSource) || !valueSourceOk(c.b))
    return <p className="grid h-full place-items-center text-center text-xs opacity-60">{editing ? 'เลือกข้อมูลค่าที่ 1 และค่าที่ 2 ที่แผง “ข้อมูล”' : 'ยังไม่ได้ตั้งค่าเงื่อนไข'}</p>;
  if (a.error || b.error) return <p className="grid h-full place-items-center px-2 text-center text-xs text-danger">{a.error || b.error}</p>;
  if (!a.ready || !b.ready) return <div className="skeleton h-full w-full" />;
  const av = a.v ?? null;
  const bv = b.v ?? null;
  const computable = av !== null && bv !== null;
  const pass = computable && compare(c.op ?? 'lt', av, bv);
  const passColor = c.passColor || '#16A34A';
  const failColor = c.failColor || '#E5484D';
  const color = !computable ? '#64748B' : pass ? passColor : failColor;
  const msg = !computable ? c.emptyMessage || 'ไม่มีข้อมูลเปรียบเทียบ' : pass ? c.passMessage || 'ผ่านเงื่อนไข' : c.failMessage || 'ไม่ผ่านเงื่อนไข';
  const dec = c.decimals ?? 0;
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2 rounded-[inherit] px-1" style={c.tint !== false ? { background: `${color}14` } : undefined}>
      <div className="flex items-center gap-2" style={{ color }}>
        {c.showIcon !== false && (pass ? <CheckCircle2 className="h-6 w-6 shrink-0" /> : <CircleAlert className="h-6 w-6 shrink-0" />)}
        <p className="font-semibold leading-tight" style={{ fontSize: c.messageSize ?? 22 }}>{msg}</p>
      </div>
      {c.showValues !== false && (
        <p className="text-xs opacity-75">
          {c.labelA || 'ค่าที่ 1'}: <b className="tabular-nums">{av === null ? '–' : fmtNumber(av, dec)}</b>
          <span className="mx-1.5">{COMPARE_OPS.find((o) => o.v === (c.op ?? 'lt'))?.label.replace('A', '').replace('B', '').trim()}</span>
          {c.labelB || 'ค่าที่ 2'}: <b className="tabular-nums">{bv === null ? '–' : fmtNumber(bv, dec)}</b>
        </p>
      )}
    </div>
  );
}

export type { WidgetData };
