import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, ListPlus, Search } from 'lucide-react';
import { rowsApi } from '@/api/endpoints';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/cn';
import { isDateish, isNumeric, isSelect, TYPE_META } from '@/lib/columnTypes';
import { fmtDate, fmtNumber } from '@/lib/format';
import type { Column, ColumnFilter, FilterOp, SortSpec } from '@/types';
import { Button } from '../ui/Button';
import { Checkbox, Select, TextInput } from '../ui/Inputs';
import { Skeleton } from '../ui/misc';
import { Popover } from '../ui/Popover';
import { Chip } from './CellView';

const OPS: Record<string, { v: FilterOp; label: string }[]> = {
  text: [
    { v: 'contains', label: 'มีคำว่า' }, { v: 'not_contains', label: 'ไม่มีคำว่า' }, { v: 'eq', label: 'เท่ากับ' }, { v: 'neq', label: 'ไม่เท่ากับ' },
    { v: 'starts_with', label: 'ขึ้นต้นด้วย' }, { v: 'ends_with', label: 'ลงท้ายด้วย' }, { v: 'is_empty', label: 'ว่าง' }, { v: 'not_empty', label: 'ไม่ว่าง' },
  ],
  number: [
    { v: 'eq', label: '=' }, { v: 'neq', label: '≠' }, { v: 'gt', label: '>' }, { v: 'gte', label: '≥' }, { v: 'lt', label: '<' }, { v: 'lte', label: '≤' },
    { v: 'between', label: 'ระหว่าง' }, { v: 'is_empty', label: 'ว่าง' }, { v: 'not_empty', label: 'ไม่ว่าง' },
  ],
  date: [
    { v: 'eq', label: 'ตรงกับวันที่' }, { v: 'gt', label: 'หลังวันที่' }, { v: 'gte', label: 'ตั้งแต่วันที่' }, { v: 'lt', label: 'ก่อนวันที่' },
    { v: 'lte', label: 'ถึงวันที่' }, { v: 'between', label: 'ช่วงวันที่' }, { v: 'is_empty', label: 'ว่าง' }, { v: 'not_empty', label: 'ไม่ว่าง' },
  ],
  other: [{ v: 'is_empty', label: 'ว่าง' }, { v: 'not_empty', label: 'ไม่ว่าง' }],
};
const opsFor = (c: Column) => (isNumeric(c.dataType) ? OPS.number : isDateish(c.dataType) ? OPS.date : ['varchar', 'text', 'url', 'email'].includes(c.dataType) ? OPS.text : OPS.other);
const keyOf = (v: unknown) => JSON.stringify(v);

export function ColumnFilterMenu({ open, onClose, anchor, sheetId, column, filters, sorts, search, onApply, onSort }: {
  open: boolean; onClose: () => void; anchor: HTMLElement | null; sheetId: string; column: Column | null; filters: ColumnFilter[]; sorts: SortSpec[];
  search: string; onApply: (f: ColumnFilter | null) => void; onSort: (s: SortSpec[]) => void;
}) {
  const existing = column ? filters.find((f) => f.columnId === column.id) : undefined;
  const [vs, setVs] = useState('');
  const dvs = useDebounce(vs, 250);
  const [data, setData] = useState<{ items: { value: any; count: number }[]; blankCount: number; truncated: boolean } | null>(null);
  const [mode, setMode] = useState<'all' | 'include' | 'exclude'>('all');
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [blank, setBlank] = useState(true);
  const [op, setOp] = useState<FilterOp | ''>('');
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const known = useMemo(() => new Map<string, any>(), [column?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !column) return;
    setVs('');
    setOp((existing?.op as FilterOp) ?? '');
    setV1(existing?.value != null ? String(existing.value) : '');
    setV2(existing?.value2 != null ? String(existing.value2) : '');
    if (existing?.values) {
      setMode(existing.mode === 'exclude' ? 'exclude' : 'include');
      setKeys(new Set(existing.values.map((v) => { known.set(keyOf(v), v); return keyOf(v); })));
      setBlank(existing.mode === 'exclude' ? !existing.blank : !!existing.blank);
    } else { setMode('all'); setKeys(new Set()); setBlank(true); }
  }, [open, column?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !column) return;
    let live = true;
    setData(null);
    rowsApi.distinct(sheetId, { columnId: column.id, filters, search: search || undefined, valueSearch: dvs || undefined, limit: 500 })
      .then((r) => { if (live) { r.items.forEach((i) => known.set(keyOf(i.value), i.value)); setData(r); } })
      .catch(() => live && setData({ items: [], blankCount: 0, truncated: false }));
    return () => { live = false; };
  }, [open, column?.id, dvs, sheetId, JSON.stringify(filters), search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!column) return null;
  const checked = (k: string) => (mode === 'all' ? true : mode === 'include' ? keys.has(k) : !keys.has(k));
  const toggle = (k: string) => {
    if (mode === 'all') { setMode('exclude'); setKeys(new Set([k])); return; }
    const n = new Set(keys);
    if (n.has(k)) n.delete(k); else n.add(k);
    setKeys(n);
  };
  const label = (v: any) => {
    if (column.dataType === 'boolean') return v ? 'ใช่ (TRUE)' : 'ไม่ใช่ (FALSE)';
    if (isNumeric(column.dataType)) return fmtNumber(v, column.validation?.decimals);
    if (isDateish(column.dataType)) return fmtDate(String(v));
    return String(v);
  };
  const apply = () => {
    const f: ColumnFilter = { columnId: column.id };
    if (mode !== 'all') {
      f.mode = mode;
      f.values = [...keys].map((k) => known.get(k) ?? JSON.parse(k));
      f.blank = mode === 'include' ? blank : !blank;
    } else if (!blank) { f.mode = 'exclude'; f.values = []; f.blank = true; }
    if (op) { f.op = op; if (!['is_empty', 'not_empty'].includes(op)) { f.value = v1; if (op === 'between') f.value2 = v2; } }
    onApply(f.values || f.op ? f : null);
    onClose();
  };
  const setSort = (dir: 'asc' | 'desc', append: boolean) => {
    onSort(append ? [...sorts.filter((s) => s.columnId !== column.id), { columnId: column.id, dir }] : [{ columnId: column.id, dir }]);
    onClose();
  };
  const inputType = isDateish(column.dataType) ? 'date' : 'text';
  const allChecked = mode === 'all' && blank;
  const noneChecked = mode === 'include' && keys.size === 0 && !blank;

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} width={300}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{TYPE_META[column.dataType].icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{column.name}</span>
        <span className="text-[11px] text-muted">{TYPE_META[column.dataType].label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 border-b border-line p-2">
        <button onClick={() => setSort('asc', false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] hover:bg-ink/5"><ArrowDownAZ className="h-4 w-4" />{isNumeric(column.dataType) ? 'น้อย → มาก' : isDateish(column.dataType) ? 'เก่า → ใหม่' : 'ก → ฮ'}</button>
        <button onClick={() => setSort('desc', false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] hover:bg-ink/5"><ArrowUpAZ className="h-4 w-4" />{isNumeric(column.dataType) ? 'มาก → น้อย' : isDateish(column.dataType) ? 'ใหม่ → เก่า' : 'ฮ → ก'}</button>
        {sorts.length > 0 && !sorts.some((s) => s.columnId === column.id) && (
          <button onClick={() => setSort('asc', true)} className="col-span-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10"><ListPlus className="h-3.5 w-3.5" />เพิ่มเป็นการเรียงลำดับถัดไป</button>
        )}
      </div>
      <div className="space-y-2 border-b border-line p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">เงื่อนไข</p>
        <Select value={op} onChange={(e) => setOp(e.target.value as FilterOp)} className="[&>select]:!h-9">
          <option value="">ไม่ใช้เงื่อนไข</option>
          {opsFor(column).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </Select>
        {op && !['is_empty', 'not_empty'].includes(op) && (
          <div className="flex items-center gap-2">
            <TextInput type={inputType} value={v1} onChange={(e) => setV1(e.target.value)} className="!h-9" placeholder="ค่า" />
            {op === 'between' && <><span className="text-xs text-muted">ถึง</span><TextInput type={inputType} value={v2} onChange={(e) => setV2(e.target.value)} className="!h-9" placeholder="ค่า" /></>}
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-ink/5 px-2.5">
          <Search className="h-4 w-4 text-muted" />
          <input value={vs} onChange={(e) => setVs(e.target.value)} placeholder="ค้นหาค่าในคอลัมน์…" className="h-9 w-full bg-transparent text-sm outline-none" autoFocus />
        </div>
        <div className="flex items-center justify-between px-1.5 py-1 text-xs">
          <Checkbox checked={allChecked} indeterminate={!allChecked && !noneChecked} onChange={() => (allChecked ? (setMode('include'), setKeys(new Set()), setBlank(false)) : (setMode('all'), setKeys(new Set()), setBlank(true)))} label="เลือกทั้งหมด" />
          {data && <span className="text-muted">{data.items.length}{data.truncated ? '+' : ''} ค่า</span>}
        </div>
        <div className="max-h-56 overflow-y-auto">
          {!data ? <div className="space-y-1.5 p-1.5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6" />)}</div> : (
            <>
              {!vs && data.blankCount > 0 && (
                <div className="flex items-center justify-between rounded-lg px-1.5 py-1 hover:bg-ink/5">
                  <Checkbox checked={blank} onChange={setBlank} label={<span className="italic text-muted">(ว่าง)</span>} />
                  <span className="text-[11px] tabular-nums text-muted">{data.blankCount}</span>
                </div>
              )}
              {data.items.map((it) => {
                const k = keyOf(it.value);
                const opt = isSelect(column.dataType) ? column.options.find((o) => o.value === it.value) : undefined;
                return (
                  <div key={k} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-ink/5">
                    <Checkbox checked={checked(k)} onChange={() => toggle(k)} className="min-w-0 flex-1"
                      label={opt ? <Chip label={opt.label} color={opt.color} size="sm" /> : label(it.value)} />
                    <span className="text-[11px] tabular-nums text-muted">{it.count}</span>
                  </div>
                );
              })}
              {!data.items.length && !data.blankCount && <p className="py-4 text-center text-xs text-muted">ไม่มีค่า</p>}
              {data.truncated && <p className="px-1.5 py-1 text-[11px] text-muted">แสดง 500 ค่าแรก — พิมพ์ค้นหาเพื่อจำกัดรายการ</p>}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line p-2">
        <button onClick={() => { onApply(null); onClose(); }} disabled={!existing} className="rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-danger disabled:opacity-40">ล้างตัวกรอง</button>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button size="sm" onClick={apply}>ใช้ตัวกรอง</Button>
        </div>
      </div>
    </Popover>
  );
}

export function FilterBar({ columns, filters, sorts, onOpen, onClearFilters, onRemoveSort }: {
  columns: Column[]; filters: ColumnFilter[]; sorts: SortSpec[]; onOpen: (colId: string, el: HTMLElement) => void; onClearFilters: () => void; onRemoveSort: (colId: string) => void;
}) {
  const name = (id: string) => columns.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <span className="shrink-0 text-xs font-medium text-muted">กรอง / เรียง</span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
        {columns.map((c) => {
          const f = filters.find((x) => x.columnId === c.id);
          const s = sorts.find((x) => x.columnId === c.id);
          const n = f?.values ? (f.mode === 'exclude' ? `−${f.values.length}` : `${f.values.length}`) : f?.op ? '1' : '';
          return (
            <button key={c.id} onClick={(e) => onOpen(c.id, e.currentTarget)}
              className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors',
                f ? 'border-primary bg-primary text-white' : 'border-line bg-surface hover:border-primary/50')}>
              <span className="max-w-[140px] truncate">{c.name}</span>
              {n && <span className={cn('rounded px-1 text-[10px] font-semibold', f ? 'bg-white/25' : 'bg-ink/10')}>{n}</span>}
              {s && <span className="text-[10px]">{s.dir === 'asc' ? '▲' : '▼'}</span>}
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
            </button>
          );
        })}
      </div>
      {(sorts.length > 0 || filters.length > 0) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {sorts.map((s, i) => (
            <span key={s.columnId} className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary xl:inline-flex">
              {i + 1}. {name(s.columnId)} {s.dir === 'asc' ? '↑' : '↓'}
              <button onClick={() => onRemoveSort(s.columnId)} aria-label="ยกเลิกการเรียง">×</button>
            </span>
          ))}
          {filters.length > 0 && <button onClick={onClearFilters} className="rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10">ล้างตัวกรอง ({filters.length})</button>}
        </div>
      )}
    </div>
  );
}
