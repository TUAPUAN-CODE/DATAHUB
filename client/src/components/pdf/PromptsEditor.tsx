import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { PromptDef } from '@/lib/pdf/types';
import { Checkbox, Field, Select, TextInput } from '../ui/Inputs';
import { Button } from '../ui/Button';

const clean = (k: string) => k.replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 30);
const blank = (n: number): PromptDef => ({ key: `field${n}`, label: `ช่องที่ ${n}`, type: 'text', default: '' });

/** Questions asked in the export dialog; every answer becomes {{key}} in the document */
export function PromptsEditor({ prompts, onChange }: { prompts: PromptDef[]; onChange: (p: PromptDef[]) => void }) {
  const set = (i: number, p: Partial<PromptDef>) => onChange(prompts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => { const l = [...prompts]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; onChange(l); };
  return (
    <div className="space-y-2">
      {prompts.map((p, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line p-2.5">
          <div className="flex items-center gap-1.5">
            <TextInput value={p.label} onChange={(e) => set(i, { label: e.target.value })} className="!h-8" placeholder="คำถาม เช่น Line" />
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-ink/10 disabled:opacity-30" aria-label="ขึ้น"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={i === prompts.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-ink/10 disabled:opacity-30" aria-label="ลง"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => onChange(prompts.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" aria-label="ลบ"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ชื่อตัวแปร" hint={`ใช้ {{${p.key}}}`}><TextInput value={p.key} onChange={(e) => set(i, { key: clean(e.target.value) })} className="!h-8 font-mono text-xs" /></Field>
            <Field label="ชนิด">
              <Select value={p.type} onChange={(e) => set(i, { type: e.target.value as PromptDef['type'] })}>
                <option value="text">ข้อความ</option><option value="select">เลือกจากรายการ</option><option value="date">วันที่</option><option value="number">ตัวเลข</option>
              </Select>
            </Field>
          </div>
          {p.type === 'select' && (
            <Field label="ตัวเลือก (คั่นด้วยจุลภาค)"><TextInput value={(p.options ?? []).join(', ')} onChange={(e) => set(i, { options: e.target.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) })} className="!h-8" placeholder="A, B, C" /></Field>
          )}
          <Field label="ค่าเริ่มต้น" hint="ข้อความทั่วไป หรือ @today (วันนี้) · @shift (กะตามเวลา) · @user (ผู้ export)"><TextInput value={p.default ?? ''} onChange={(e) => set(i, { default: e.target.value })} className="!h-8" /></Field>
          <Checkbox checked={!!p.required} onChange={(v) => set(i, { required: v })} label="บังคับกรอก" />
        </div>
      ))}
      <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...prompts, blank(prompts.length + 1)])} disabled={prompts.length >= 12}>เพิ่มคำถาม</Button>
    </div>
  );
}
