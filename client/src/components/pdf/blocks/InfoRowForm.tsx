import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { InfoItem, InfoRowBlock, newInfoItem } from '@/lib/pdf/blocks/infoRow';
import { listTokens } from '@/lib/pdf/variables';
import { Field, TextInput, Toggle } from '../../ui/Inputs';
import { ColorInput } from '../../ui/misc';
import { Button } from '../../ui/Button';
import { Group, Num, PDF_SWATCHES, StyleForm } from '../BlockForms';
import type { BlockFormProps } from '../formRegistry';

export function InfoRowForm({ block: b, template, onChange }: BlockFormProps<InfoRowBlock>) {
  const setItem = (id: string, p: Partial<InfoItem>) => onChange({ items: b.items.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const move = (i: number, d: number) => { const l = [...b.items]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; onChange({ items: l }); };
  const tokens = listTokens(template.prompts);
  return (
    <div className="space-y-4">
      <Group title="ฟิลด์ในแถว">
        {b.items.map((it, i) => (
          <div key={it.id} className="space-y-2 rounded-xl border border-line p-2.5">
            <div className="flex items-center gap-1.5">
              <TextInput value={it.label} onChange={(e) => setItem(it.id, { label: e.target.value })} className="!h-8" placeholder="ชื่อฟิลด์ เช่น Date:" />
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-ink/10 disabled:opacity-30" aria-label="ขึ้น"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={i === b.items.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-ink/10 disabled:opacity-30" aria-label="ลง"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onChange({ items: b.items.filter((x) => x.id !== it.id) })} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" aria-label="ลบ"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <TextInput value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })} className="!h-8 font-mono text-xs" placeholder="ค่า เช่น {{date}} (เว้นว่าง = ให้เขียนมือ)" list={`tok-${it.id}`} />
            <datalist id={`tok-${it.id}`}>{tokens.map((t) => <option key={t.token} value={t.token}>{t.label}</option>)}</datalist>
            <Num label="ความกว้าง (สัดส่วน)" value={it.widthPct} onChange={(v) => setItem(it.id, { widthPct: v ?? 25 })} min={5} max={100} />
          </div>
        ))}
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange({ items: [...b.items, newInfoItem()] })} disabled={b.items.length >= 8}>เพิ่มฟิลด์</Button>
        <p className="text-[11px] text-muted">ใส่ตัวแปร เช่น {'{{shift}}'} หรือคำถามที่ตั้งไว้ใน “ตั้งค่ากระดาษ → คำถามก่อน export” เช่น {'{{line}}'}</p>
      </Group>
      <Group title="การจัดวาง">
        <Toggle checked={b.underline} onChange={(v) => onChange({ underline: v })} label="ขีดเส้นใต้ค่า" />
        <div className="grid grid-cols-2 gap-2"><Num label="ระยะห่าง" value={b.gapMm} onChange={(v) => onChange({ gapMm: v ?? 6 })} min={0} max={40} suffix="mm" /></div>
        <Field label="สีเส้น"><ColorInput value={b.lineColor} swatches={PDF_SWATCHES} onChange={(v) => onChange({ lineColor: v ?? '#9CA3AF' })} /></Field>
      </Group>
      <Group title="ตัวอักษรชื่อฟิลด์"><StyleForm s={b.labelStyle} onChange={(labelStyle) => onChange({ labelStyle })} compact /></Group>
      <Group title="ตัวอักษรค่า"><StyleForm s={b.valueStyle} onChange={(valueStyle) => onChange({ valueStyle })} compact /></Group>
    </div>
  );
}
