import type { FormLayout } from '@/api/endpoints';
import type { CellValue, Column } from '@/types';
import { useEffect, useState } from 'react';

export interface FormField { col: Column; span: number }

const WIDE = new Set(['text', 'multi_select', 'image']);

/** Columns in the order and width the manager designed (new columns that are not in the design are added at the end) */
export function buildFormFields(columns: Column[], layout: FormLayout | null | undefined, narrow: boolean): { fields: FormField[]; perRow: number } {
  const perRow = narrow ? 1 : Math.min(4, Math.max(1, layout?.perRow ?? 2));
  const byId = new Map(columns.map((c) => [c.id, c]));
  const out: FormField[] = [];
  const seen = new Set<string>();
  const clamp = (n: number) => Math.min(perRow, Math.max(1, n));
  for (const f of layout?.fields ?? []) {
    const col = byId.get(f.columnId);
    if (!col || seen.has(col.id)) continue;
    seen.add(col.id);
    if (!f.hidden) out.push({ col, span: clamp(f.span ?? (WIDE.has(col.dataType) ? perRow : 1)) });
  }
  for (const col of columns) if (!seen.has(col.id)) out.push({ col, span: clamp(WIDE.has(col.dataType) ? perRow : 1) });
  return { fields: out, perRow };
}

/** The phone-width form is always one input per line */
export function useNarrow(maxPx = 640): boolean {
  const q = `(max-width: ${maxPx}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}

/** Text from a scan → what the field holds (null = cannot be used for this column; the server checks the rest on save) */
export function coerceScanned(col: Column, text: string): CellValue | null {
  const t = text.trim();
  if (!t) return null;
  switch (col.dataType) {
    case 'int': case 'float': case 'varchar': case 'text': case 'url': case 'email': return t;
    case 'select': {
      const o = col.options.find((x) => x.value === t) ?? col.options.find((x) => x.value.toLowerCase() === t.toLowerCase() || x.label.toLowerCase() === t.toLowerCase());
      return o ? o.value : null;
    }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    case 'datetime': { const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
    case 'boolean': return /^(1|true|yes|ใช่)$/i.test(t) ? true : /^(0|false|no|ไม่)$/i.test(t) ? false : null;
    default: return null;
  }
}

/** Same limits the server applies — shown while filling the form so a wrong scan is seen at once */
export function limitError(col: Column, text: string): string | null {
  const v = col.validation ?? {};
  if ((col.dataType === 'varchar' || col.dataType === 'text') && v.maxLength && text.trim().length > v.maxLength) return `ยาวได้ไม่เกิน ${v.maxLength} ตัวอักษร (ที่สแกนได้ ${text.trim().length})`;
  if ((col.dataType === 'int' || col.dataType === 'float') && v.maxDigits && text.replace(/[^0-9]/g, '').length > v.maxDigits) return `ต้องไม่เกิน ${v.maxDigits} หลัก`;
  return null;
}
