import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { newSignatureSlot, SignatureBlock, SignatureSlot } from '@/lib/pdf/blocks/signature';
import { Checkbox, Field, TextInput } from '../../ui/Inputs';
import { ColorInput } from '../../ui/misc';
import { Button } from '../../ui/Button';
import { Group, Num, PDF_SWATCHES, StyleForm } from '../BlockForms';
import type { BlockFormProps } from '../formRegistry';

export function SignatureForm({ block: b, onChange }: BlockFormProps<SignatureBlock>) {
  const setSlot = (id: string, p: Partial<SignatureSlot>) => onChange({ slots: b.slots.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const move = (i: number, d: number) => { const l = [...b.slots]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; onChange({ slots: l }); };
  return (
    <div className="space-y-4">
      <Group title="ช่องลงชื่อ">
        {b.slots.map((s, i) => (
          <div key={s.id} className="space-y-2 rounded-xl border border-line p-2.5">
            <div className="flex items-center gap-1.5">
              <TextInput value={s.label} onChange={(e) => setSlot(s.id, { label: e.target.value })} className="!h-8" placeholder="เช่น ผู้บันทึก" />
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-ink/10 disabled:opacity-30" aria-label="ขึ้น"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={i === b.slots.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-ink/10 disabled:opacity-30" aria-label="ลง"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onChange({ slots: b.slots.filter((x) => x.id !== s.id) })} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" aria-label="ลบ"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <TextInput value={s.sublabel ?? ''} onChange={(e) => setSlot(s.id, { sublabel: e.target.value })} className="!h-8" placeholder="ข้อความรอง (ไม่บังคับ) เช่น Recorded by" />
            <TextInput value={s.defaultName ?? ''} onChange={(e) => setSlot(s.id, { defaultName: e.target.value })} className="!h-8" placeholder="ชื่อที่พิมพ์ให้ (ไม่บังคับ) เช่น {{user}}" />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Checkbox checked={s.askAtExport} onChange={(v) => setSlot(s.id, { askAtExport: v })} label="ถามชื่อตอน export" />
              <Checkbox checked={s.showDate} onChange={(v) => setSlot(s.id, { showDate: v })} label="มีบรรทัดวันที่" />
            </div>
          </div>
        ))}
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange({ slots: [...b.slots, newSignatureSlot('ผู้อนุมัติ')] })} disabled={b.slots.length >= 12}>เพิ่มช่องลงชื่อ</Button>
      </Group>
      <Group title="การจัดวาง">
        <div className="grid grid-cols-2 gap-2">
          <Num label="ช่องต่อบรรทัด" value={b.perRow} onChange={(v) => onChange({ perRow: Math.round(v ?? 3) })} min={1} max={6} />
          <Num label="พื้นที่เซ็นชื่อ (สูง)" value={b.boxHeightMm} onChange={(v) => onChange({ boxHeightMm: v ?? 14 })} min={6} max={60} suffix="mm" />
          <Num label="ระยะห่างช่อง" value={b.gapMm} onChange={(v) => onChange({ gapMm: v ?? 8 })} min={0} max={40} suffix="mm" />
          <Num label="ความหนาเส้น" value={b.lineWidth} onChange={(v) => onChange({ lineWidth: v ?? 0.6 })} min={0.1} max={3} step={0.1} />
        </div>
        <Field label="สีเส้น"><ColorInput value={b.lineColor} swatches={PDF_SWATCHES} onChange={(v) => onChange({ lineColor: v ?? '#111827' })} /></Field>
      </Group>
      <Group title="ตัวอักษรชื่อตำแหน่ง"><StyleForm s={b.labelStyle} onChange={(labelStyle) => onChange({ labelStyle })} compact /></Group>
      <Group title="ตัวอักษรชื่อผู้ลงนาม"><StyleForm s={b.nameStyle} onChange={(nameStyle) => onChange({ nameStyle })} compact /></Group>
    </div>
  );
}
