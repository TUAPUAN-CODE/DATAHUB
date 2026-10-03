import { useState } from 'react';
import { docCfgOf, hasPrefixToken } from '@/lib/docNumber';
import type { CellValue, Column } from '@/types';
import { Popover } from '../ui/Popover';
import { DocNumberField, usePrefixes } from './DocNumberField';

/** Cell popover: issue a new number with another prefix, or type a number by hand (e.g. migrated from another system) */
export function DocNumberCellEditor({ col, value, anchor, rowValues, onCommit, onCancel }: {
  col: Column; value: CellValue | undefined; anchor: HTMLElement | null; rowValues: Record<string, CellValue | undefined>;
  onCommit: (v: CellValue, move: null) => void; onCancel: () => void;
}) {
  const cfg = docCfgOf(col);
  const prefixes = usePrefixes(col);
  const [text, setText] = useState(typeof value === 'string' ? value : '');
  const orig = typeof value === 'string' ? value : '';
  const close = () => (text === orig ? onCancel() : onCommit(text.trim() || null, null));
  return (
    <Popover open anchor={anchor} onClose={close} width={Math.max(300, anchor?.offsetWidth ?? 0)}>
      <div className="space-y-3 p-3">
        {cfg && hasPrefixToken(cfg.template) && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">ออกเลขใหม่ด้วยหัวเลข</p>
            <div className="flex flex-wrap gap-1.5">
              {prefixes.map((p) => <button key={p} type="button" onClick={() => onCommit(p, null)} className="rounded-full border border-line px-3 py-1 font-mono text-xs hover:border-primary hover:text-primary">{p}</button>)}
              {!prefixes.length && <span className="text-xs text-muted">ยังไม่มีหัวเลข</span>}
            </div>
          </div>
        )}
        {cfg && !hasPrefixToken(cfg.template) && !value && <DocNumberField col={col} value={null} onChange={() => undefined} rowValues={rowValues} />}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">หรือกรอกเลขที่เอง</p>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); close(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
            className="ds-input h-9 w-full px-3 font-mono text-sm" placeholder="CSM-260926-009" />
        </div>
      </div>
    </Popover>
  );
}
