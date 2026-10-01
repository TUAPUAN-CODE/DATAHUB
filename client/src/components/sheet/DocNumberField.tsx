import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { rowsApi } from '@/api/endpoints';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/cn';
import { docCfgOf, hasPrefixToken, renderDocPreview } from '@/lib/docNumber';
import { fetchLookupOptions } from '@/lib/lookup';
import type { CellValue, Column } from '@/types';

type DocCol = Pick<Column, 'dataType' | 'validation'> & Partial<Pick<Column, 'id' | 'sheetId'>>;

/** Prefix choices (CSM, CSN …) of an auto-numbered column */
export function usePrefixes(col: DocCol): string[] {
  const cfg = docCfgOf(col as Column);
  const [list, setList] = useState<string[]>(cfg?.prefixes ?? []);
  useEffect(() => {
    if (!cfg || !hasPrefixToken(cfg.template)) return;
    if (cfg.prefixLookup?.columnId && col.id && col.sheetId) { let live = true; void fetchLookupOptions(col as Column, null, true).then((o) => live && setList(o)); return () => { live = false; }; }
    setList(cfg.prefixes ?? []);
  }, [col.id, cfg?.template, cfg?.prefixLookup?.columnId, (cfg?.prefixes ?? []).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

/** Form input for an auto-numbered document id: choose the prefix, the rest is generated when the row is saved */
export function DocNumberField({ col, value, onChange, rowValues, invalid }: {
  col: DocCol; value: CellValue | undefined; onChange: (v: CellValue) => void; rowValues?: Record<string, CellValue | undefined>; invalid?: boolean;
}) {
  const cfg = docCfgOf(col as Column);
  const prefixes = usePrefixes(col);
  const text = typeof value === 'string' ? value : '';
  const usesPrefix = !!cfg && hasPrefixToken(cfg.template);
  const isPrefix = prefixes.some((p) => p.toLowerCase() === text.toLowerCase());
  const existing = !!text && !isPrefix; // a real number that was already issued
  const dateCol = cfg?.dateColumnId ? rowValues?.[cfg.dateColumnId] : null;
  const prefix = isPrefix ? prefixes.find((p) => p.toLowerCase() === text.toLowerCase())! : null;
  const dPrefix = useDebounce(prefix, 250);
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    setNext(null);
    if (!cfg || !col.id || !col.sheetId || existing) return;
    if (usesPrefix && !dPrefix) return;
    let live = true;
    rowsApi.docPreview(col.sheetId, { columnId: col.id, prefix: dPrefix, date: typeof dateCol === 'string' ? dateCol : null }).then((r) => live && setNext(r.number)).catch(() => undefined);
    return () => { live = false; };
  }, [col.id, dPrefix, existing, usesPrefix, typeof dateCol === 'string' ? dateCol : '']); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg) return <p className="text-sm text-muted">ยังไม่ได้กำหนดรูปแบบเลขที่</p>;
  const sample = renderDocPreview(cfg.template, prefixes[0] ?? null);

  return (
    <div className={cn('space-y-1.5', invalid && '[&_select]:!border-danger')}>
      {existing && (
        <div className="flex items-center gap-2 rounded-xl bg-ink/[.04] px-3 py-2.5">
          <Ticket className="h-4 w-4 text-primary" /><span className="font-mono text-sm font-semibold">{text}</span>
        </div>
      )}
      {usesPrefix && (
        <select value={isPrefix ? prefix! : ''} onChange={(e) => onChange(e.target.value || (existing ? text : null))} className="ds-input h-10 w-full px-3 text-sm">
          <option value="">{existing ? 'ออกเลขใหม่ด้วยหัวเลข… (ไม่เปลี่ยนถ้าไม่เลือก)' : '— เลือกหัวเลข —'}</option>
          {prefixes.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      {!existing && (
        <p className="text-xs text-muted">
          {usesPrefix && !prefix ? <>เลือกหัวเลข ระบบจะเติมส่วนที่เหลือให้อัตโนมัติ เช่น <span className="font-mono">{sample}</span></>
            : <>เลขที่ที่จะได้: <span className="font-mono font-semibold text-primary">{next ?? '…'}</span> <span>(ยืนยันเลขจริงตอนบันทึก)</span></>}
        </p>
      )}
    </div>
  );
}
