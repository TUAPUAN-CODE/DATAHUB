import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import type { FormLayout } from '@/api/endpoints';
import { toast } from '@/store/ui';
import type { Column } from '@/types';
import { Button } from '@/components/ui/Button';
import { Segmented, Select } from '@/components/ui/Inputs';
import { formLayoutApi } from '../scan/api';
import { buildFormFields } from './formLayout';

/** Managers design the "add row" form: inputs per line, order, width of each field, hidden fields */
export function FormDesigner({ sheetId, columns, layout, onSaved, onCancel }: { sheetId: string; columns: Column[]; layout: FormLayout | null | undefined; onSaved: () => void; onCancel: () => void }) {
  const initial = buildFormFields(columns, layout, false);
  const hiddenIds = new Set((layout?.fields ?? []).filter((f) => f.hidden).map((f) => f.columnId));
  const [perRow, setPerRow] = useState(layout?.perRow ?? 2);
  const [items, setItems] = useState(() => [
    ...initial.fields.map((f) => ({ col: f.col, span: f.span, hidden: false })),
    ...columns.filter((c) => hiddenIds.has(c.id) && !initial.fields.some((f) => f.col.id === c.id)).map((c) => ({ col: c, span: 1, hidden: true })),
  ]);
  const [busy, setBusy] = useState(false);
  const move = (i: number, d: number) => setItems((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patch = (i: number, p: Partial<{ span: number; hidden: boolean }>) => setItems((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = async (reset = false) => {
    setBusy(true);
    try {
      await formLayoutApi.save(sheetId, reset ? null : { perRow, fields: items.map((x) => ({ columnId: x.col.id, span: Math.min(x.span, perRow), hidden: x.hidden || undefined })) });
      toast.success(reset ? 'คืนค่าแบบฟอร์มเริ่มต้นแล้ว' : 'บันทึกแบบฟอร์มแล้ว');
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">จำนวนช่องกรอกต่อบรรทัด</span>
        <Segmented size="sm" value={String(perRow)} onChange={(v) => setPerRow(Number(v))} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} />
        <span className="text-xs text-muted">บนมือถือแสดงบรรทัดละ 1 ช่องเสมอ</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
        {items.map((x, i) => (
          <div key={x.col.id} className={`flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-0 ${x.hidden ? 'bg-ink/[.03] opacity-60' : ''}`}>
            <span className="min-w-0 flex-1 truncate text-sm">{x.col.name}{x.col.isRequired && <span className="ml-0.5 text-danger">*</span>}</span>
            <Select value={String(Math.min(x.span, perRow))} onChange={(e) => patch(i, { span: Number(e.target.value) })} disabled={x.hidden} className="!h-8 !w-32 text-xs">
              {Array.from({ length: perRow }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n === perRow ? (perRow === 1 ? 'เต็มบรรทัด' : 'เต็มบรรทัด') : `กว้าง ${n} ช่อง`}</option>)}
            </Select>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="เลื่อนขึ้น"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="เลื่อนลง"><ArrowDown className="h-4 w-4" /></button>
            <button type="button" onClick={() => patch(i, { hidden: !x.hidden })} disabled={x.col.isRequired && x.col.dataType !== 'doc_number'} title={x.col.isRequired ? 'คอลัมน์บังคับกรอกซ่อนไม่ได้' : x.hidden ? 'แสดงในฟอร์ม' : 'ซ่อนจากฟอร์ม'}
              className="rounded p-1 text-muted hover:text-ink disabled:opacity-30">{x.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => void save(true)} loading={busy}>คืนค่าเริ่มต้น</Button>
        <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>
        <Button onClick={() => void save()} loading={busy}>บันทึกแบบฟอร์ม</Button>
      </div>
    </div>
  );
}
