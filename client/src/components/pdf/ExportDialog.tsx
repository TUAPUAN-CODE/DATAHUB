import { ReactNode, useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';
import type { ExportValues } from '@/lib/pdf/build';
import { signatureSlotsOf } from '@/lib/pdf/blocks/signature';
import { defaultExportValues } from '@/lib/pdf/exportValues';
import type { PdfTemplate, PromptDef } from '@/lib/pdf/types';
import { Button } from '../ui/Button';
import { Field, Select, TextInput } from '../ui/Inputs';
import { Modal } from '../ui/Modal';

const memKey = (k: string) => `pdfExport:${k}`;

function PromptField({ p, value, onChange, error }: { p: PromptDef; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={p.label || p.key} required={p.required} error={error}>
      {p.type === 'select'
        ? <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">— เลือก —</option>{(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
        : <TextInput type={p.type === 'date' ? 'date' : p.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/**
 * Asks for what the document needs before it is created: the questions defined in the designer (Line, Plant …)
 * and the names for the signature boxes. `extra` lets another module add its own options (e.g. the archive).
 */
export function ExportDialog({ open, onClose, template, user, memoryKey, busy, onConfirm, extra }: {
  open: boolean; onClose: () => void; template: PdfTemplate; user: string; memoryKey: string; busy?: boolean;
  onConfirm: (v: Required<ExportValues>) => void; extra?: ReactNode;
}) {
  const slots = signatureSlotsOf(template);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [signers, setSigners] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const def = defaultExportValues(template, user);
    let last: { prompts?: Record<string, string>; signers?: Record<string, string> } = {};
    try { last = JSON.parse(localStorage.getItem(memKey(memoryKey)) ?? '{}'); } catch { /* ignore */ }
    // remembered answers win, except values that follow the clock (@today, @shift)
    const merged = { ...def.prompts };
    for (const p of template.prompts ?? []) if (last.prompts?.[p.key] !== undefined && !(p.default ?? '').startsWith('@')) merged[p.key] = last.prompts[p.key];
    setPrompts(merged); setSigners(last.signers ?? {}); setErrors({});
  }, [open, template, user, memoryKey]);

  const confirm = () => {
    const errs: Record<string, string> = {};
    for (const p of template.prompts ?? []) if (p.required && !(prompts[p.key] ?? '').trim()) errs[p.key] = 'จำเป็นต้องกรอก';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try { localStorage.setItem(memKey(memoryKey), JSON.stringify({ prompts, signers })); } catch { /* ignore */ }
    onConfirm({ prompts, signers });
  };

  return (
    <Modal open={open} onClose={onClose} size="md" icon={<FileDown className="h-5 w-5" />} title={`ส่งออก PDF — ${template.name}`} description="ข้อมูลที่กรอกจะถูกใส่ลงในเอกสารตามที่ออกแบบไว้"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button icon={<FileDown className="h-4 w-4" />} onClick={confirm} loading={busy}>สร้าง PDF</Button></>}>
      <div className="space-y-4">
        {!!template.prompts?.length && (
          <div className="grid gap-3 sm:grid-cols-2">
            {template.prompts.map((p) => <PromptField key={p.key} p={p} value={prompts[p.key] ?? ''} onChange={(v) => setPrompts((s) => ({ ...s, [p.key]: v }))} error={errors[p.key]} />)}
          </div>
        )}
        {!!slots.length && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">ชื่อผู้ลงนาม (เว้นว่างได้ — เซ็นด้วยมือบนกระดาษ)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {slots.map((s) => (
                <Field key={s.id} label={s.label}><TextInput value={signers[s.id] ?? ''} onChange={(e) => setSigners((m) => ({ ...m, [s.id]: e.target.value }))} placeholder={s.defaultName || 'ชื่อ-นามสกุล'} /></Field>
              ))}
            </div>
          </div>
        )}
        {extra}
      </div>
    </Modal>
  );
}
