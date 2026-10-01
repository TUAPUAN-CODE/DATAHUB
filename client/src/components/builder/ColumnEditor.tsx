import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DATA_TYPES, isDateish, isNumeric, isSelect, newDraft, TYPE_META } from '@/lib/columnTypes';
import { SWATCHES } from '@/lib/format';
import type { ColumnDraft, DataType, SelectOption } from '@/types';
import { Checkbox, Field, Select, TextInput } from '../ui/Inputs';
import { FieldInput } from '../sheet/FieldInput';

function OptionsEditor({ options, onChange }: { options: SelectOption[]; onChange: (o: SelectOption[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const label = draft.trim();
    if (!label || options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return;
    let value = label;
    let i = 2;
    while (options.some((o) => o.value === value)) value = `${label}-${i++}`;
    onChange([...options, { value, label, color: SWATCHES[options.length % SWATCHES.length] }]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={o.value} className="flex items-center gap-2">
          <button type="button" title="เปลี่ยนสี" className="h-6 w-6 shrink-0 rounded-full ring-1 ring-line" style={{ background: o.color ?? '#94a3b8' }}
            onClick={() => onChange(options.map((x, j) => (j === i ? { ...x, color: SWATCHES[(SWATCHES.indexOf(x.color ?? '') + 1) % SWATCHES.length] } : x)))} />
          <TextInput value={o.label} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="!h-9" />
          <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label="ลบตัวเลือก"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-ink/25" />
        <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="พิมพ์ตัวเลือกแล้วกด Enter" className="!h-9" />
        <button type="button" onClick={add} className="rounded-lg p-1.5 text-primary hover:bg-primary/10" aria-label="เพิ่มตัวเลือก"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));

function ColumnDetails({ c, set }: { c: ColumnDraft; set: (p: Partial<ColumnDraft>) => void }) {
  const v = c.validation ?? {};
  const setV = (p: Record<string, unknown>) => set({ validation: { ...v, ...p } });
  return (
    <div className="grid gap-4 border-t border-line bg-ink/[.02] p-4 md:grid-cols-2">
      <Field label="คำอธิบาย (แสดงเป็นคำแนะนำ)"><TextInput value={c.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="ข้อความตัวอย่างในช่องกรอก"><TextInput value={c.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value })} /></Field>
      {isSelect(c.dataType) && (
        <Field label="ตัวเลือก" className="md:col-span-2" hint="กดวงกลมเพื่อเปลี่ยนสีของแต่ละตัวเลือก">
          <OptionsEditor options={c.options ?? []} onChange={(options) => set({ options })} />
        </Field>
      )}
      {isNumeric(c.dataType) && (
        <>
          <Field label="ค่าต่ำสุด"><TextInput inputMode="decimal" value={v.min ?? ''} onChange={(e) => setV({ min: num(e.target.value) })} /></Field>
          <Field label="ค่าสูงสุด"><TextInput inputMode="decimal" value={v.max ?? ''} onChange={(e) => setV({ max: num(e.target.value) })} /></Field>
          {c.dataType === 'float' && <Field label="จำนวนทศนิยม"><TextInput inputMode="numeric" value={v.decimals ?? ''} onChange={(e) => setV({ decimals: num(e.target.value) })} /></Field>}
        </>
      )}
      {(c.dataType === 'varchar' || c.dataType === 'text') && (
        <>
          <Field label="ความยาวสูงสุด (ตัวอักษร)"><TextInput inputMode="numeric" value={v.maxLength ?? ''} onChange={(e) => setV({ maxLength: num(e.target.value) })} /></Field>
          <Field label="รูปแบบ (Regex)" hint="เช่น ^PF\d-\d{2}$"><TextInput value={v.pattern ?? ''} onChange={(e) => setV({ pattern: e.target.value || null })} className="font-mono" /></Field>
          {v.pattern && <Field label="ข้อความเมื่อรูปแบบไม่ถูกต้อง"><TextInput value={v.patternMessage ?? ''} onChange={(e) => setV({ patternMessage: e.target.value })} /></Field>}
        </>
      )}
      {isDateish(c.dataType) && (
        <>
          <Field label="วันที่เร็วที่สุด"><TextInput type="date" value={v.minDate ?? ''} onChange={(e) => setV({ minDate: e.target.value || null })} /></Field>
          <Field label="วันที่ช้าที่สุด"><TextInput type="date" value={v.maxDate ?? ''} onChange={(e) => setV({ maxDate: e.target.value || null })} /></Field>
        </>
      )}
      {c.dataType === 'image' && <Field label="จำนวนรูปสูงสุดต่อเซลล์ (ว่าง = ไม่จำกัด)"><TextInput inputMode="numeric" value={v.maxSelections ?? ''} onChange={(e) => setV({ maxSelections: num(e.target.value) })} /></Field>}
      {c.dataType === 'multi_select' && <Field label="เลือกได้สูงสุด"><TextInput inputMode="numeric" value={v.maxSelections ?? ''} onChange={(e) => setV({ maxSelections: num(e.target.value) })} /></Field>}
      <Field label="ค่าเริ่มต้นเมื่อเพิ่มแถวใหม่">
        <FieldInput col={{ ...c, placeholder: 'ไม่มี', options: c.options ?? [], validation: v } as any} value={c.defaultValue ?? null} onChange={(d) => set({ defaultValue: d })} />
      </Field>
      <Field label="ความกว้างเริ่มต้น (px)"><TextInput inputMode="numeric" value={c.width} onChange={(e) => set({ width: Math.max(40, Math.min(1200, Number(e.target.value) || 40)) })} /></Field>
    </div>
  );
}

export function validateDrafts(cols: ColumnDraft[]): string | null {
  if (!cols.length) return 'ต้องมีอย่างน้อย 1 คอลัมน์';
  const seen = new Set<string>();
  for (const [i, c] of cols.entries()) {
    const n = c.name.trim();
    if (!n) return `คอลัมน์ที่ ${i + 1} ยังไม่มีชื่อ`;
    if (seen.has(n.toLowerCase())) return `ชื่อคอลัมน์ "${n}" ซ้ำกัน`;
    seen.add(n.toLowerCase());
    if (isSelect(c.dataType) && !(c.options ?? []).length) return `คอลัมน์ "${n}" ต้องมีตัวเลือกอย่างน้อย 1 รายการ`;
  }
  return null;
}

export const draftToPayload = (c: ColumnDraft) => ({
  name: c.name.trim(), dataType: c.dataType, isRequired: c.isRequired, width: c.width,
  defaultValue: c.defaultValue === '' ? null : c.defaultValue ?? null, placeholder: c.placeholder || null, description: c.description || null,
  validation: c.validation && Object.values(c.validation).some((x) => x !== null && x !== undefined && x !== '') ? c.validation : null,
  options: isSelect(c.dataType) ? (c.options ?? []).map((o) => ({ ...o, label: o.label.trim() || o.value })) : null,
});

export function ColumnEditor({ columns, onChange, lockedTypes }: { columns: ColumnDraft[]; onChange: (c: ColumnDraft[]) => void; lockedTypes?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const set = (key: string, p: Partial<ColumnDraft>) => onChange(columns.map((c) => (c.key === key ? { ...c, ...p } : c)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const changeType = (c: ColumnDraft, t: DataType) =>
    set(c.key, { dataType: t, width: TYPE_META[t].width, defaultValue: null, validation: {}, options: isSelect(t) ? c.options ?? [] : null });

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[28px_1fr_200px_92px_72px] gap-3 px-3 text-xs font-medium text-muted md:grid">
        <span /><span>ชื่อคอลัมน์</span><span>ชนิดข้อมูล</span><span>บังคับกรอก</span><span />
      </div>
      <AnimatePresence initial={false}>
        {columns.map((c, i) => (
          <motion.div key={c.key} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            onDragOver={(e) => { if (dragKey && dragKey !== c.key) { e.preventDefault(); } }}
            onDrop={() => {
              if (!dragKey) return;
              const from = columns.findIndex((x) => x.key === dragKey);
              const next = [...columns];
              const [m] = next.splice(from, 1);
              next.splice(i, 0, m);
              onChange(next);
              setDragKey(null);
            }}
            className={cn('ds-card overflow-hidden', dragKey === c.key && 'opacity-50')}>
            <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 p-2.5 md:grid-cols-[28px_1fr_200px_92px_72px]">
              <span draggable onDragStart={() => setDragKey(c.key)} onDragEnd={() => setDragKey(null)} className="grid cursor-grab place-items-center text-muted active:cursor-grabbing" title="ลากเพื่อจัดลำดับ">
                <GripVertical className="h-4 w-4" />
              </span>
              <TextInput value={c.name} onChange={(e) => set(c.key, { name: e.target.value })} placeholder={`คอลัมน์ ${i + 1}`} className="!h-9" maxLength={200} />
              <div className="col-span-3 flex items-center gap-3 md:contents">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary [&>svg]:h-4 [&>svg]:w-4">{TYPE_META[c.dataType].icon}</span>
                  <Select value={c.dataType} onChange={(e) => changeType(c, e.target.value as DataType)} disabled={lockedTypes && !!c.id} className="[&>select]:!h-9 [&>select]:pl-8">
                    {DATA_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label} · {TYPE_META[t].sql}</option>)}
                  </Select>
                </div>
                <div className="flex justify-center"><Checkbox checked={c.isRequired} onChange={(v) => set(c.key, { isRequired: v })} label={<span className="md:hidden">บังคับกรอก</span>} /></div>
                <div className="flex items-center justify-end gap-0.5">
                  <button type="button" onClick={() => setOpen(open === c.key ? null : c.key)} className={cn('rounded-lg p-1.5 hover:bg-ink/5', open === c.key ? 'text-primary' : 'text-muted')} aria-label="ตั้งค่าเพิ่มเติม">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', open === c.key && 'rotate-180')} />
                  </button>
                  <button type="button" onClick={() => onChange(columns.filter((x) => x.key !== c.key))} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label="ลบคอลัมน์"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-muted md:pl-[52px]">
              <span>{TYPE_META[c.dataType].hint}</span>
              <span className="ml-auto flex md:hidden">
                <button type="button" onClick={() => move(i, -1)} className="p-1"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1"><ArrowDown className="h-3.5 w-3.5" /></button>
              </span>
            </div>
            <AnimatePresence initial={false}>
              {open === c.key && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <ColumnDetails c={c} set={(p) => set(c.key, p)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
      <button type="button" onClick={() => { const d = newDraft(); onChange([...columns, d]); }}
        className="flex w-full items-center justify-center gap-2 rounded-theme border-2 border-dashed border-line py-3 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-primary">
        <Plus className="h-4 w-4" /> เพิ่มคอลัมน์
      </button>
    </div>
  );
}
