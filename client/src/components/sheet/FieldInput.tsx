import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import type { CellValue, Column } from '@/types';
import { TextArea, TextInput, Toggle } from '../ui/Inputs';
import { SearchSelect } from '../ui/SearchSelect';

type Col = Pick<Column, 'dataType' | 'options' | 'placeholder' | 'validation' | 'name'>;

/** Form input for one typed value (row form, default values, filters) */
export function FieldInput({ col, value, onChange, invalid, autoFocus }: {
  col: Col; value: CellValue | undefined; onChange: (v: CellValue) => void; invalid?: boolean; autoFocus?: boolean;
}) {
  const ph = col.placeholder ?? undefined;
  switch (col.dataType) {
    case 'text':
      return <TextArea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={ph} invalid={invalid} autoFocus={autoFocus} />;
    case 'int':
    case 'float':
      return <TextInput inputMode="decimal" value={value === null || value === undefined ? '' : String(value)} placeholder={ph ?? (col.dataType === 'int' ? '0' : '0.00')}
        onChange={(e) => onChange(e.target.value)} invalid={invalid} autoFocus={autoFocus} className="tabular-nums" />;
    case 'date':
      return <TextInput type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} invalid={invalid} autoFocus={autoFocus} />;
    case 'datetime':
      return <TextInput type="datetime-local" value={toLocalInput(value as string)} onChange={(e) => onChange(fromLocalInput(e.target.value))} invalid={invalid} autoFocus={autoFocus} />;
    case 'boolean':
      return <div className="flex h-10 items-center"><Toggle checked={!!value} onChange={(v) => onChange(v)} label={value ? 'ใช่' : 'ไม่ใช่'} /></div>;
    case 'select':
      return (
        <SearchSelect value={(value as string) ?? null} onChange={(v) => onChange(v)} placeholder={ph ?? 'เลือก…'} className={invalid ? '!border-danger' : ''}
          options={[{ value: '', label: '— ไม่ระบุ —' }, ...(col.options ?? []).map((o) => ({ value: o.value, label: o.label, color: o.color }))]} />
      );
    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [];
      const max = col.validation?.maxSelections ?? Infinity;
      return (
        <div className={cn('ds-input flex min-h-10 flex-wrap gap-1.5 p-1.5', invalid && '!border-danger')}>
          {(col.options ?? []).map((o) => {
            const on = arr.includes(o.value);
            return (
              <button key={o.value} type="button" disabled={!on && arr.length >= max}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40', on ? 'border-transparent text-white' : 'border-line hover:border-primary/40')}
                style={on ? { background: o.color ?? 'rgb(var(--c-primary))' } : undefined}>
                {on && <Check className="h-3 w-3" />}{o.label}
              </button>
            );
          })}
          {!col.options?.length && <span className="px-2 py-1 text-xs text-muted">ยังไม่มีตัวเลือก</span>}
        </div>
      );
    }
    default:
      return <TextInput type={col.dataType === 'email' ? 'email' : col.dataType === 'url' ? 'url' : 'text'} value={(value as string) ?? ''} placeholder={ph}
        onChange={(e) => onChange(e.target.value)} invalid={invalid} autoFocus={autoFocus} />;
  }
}
