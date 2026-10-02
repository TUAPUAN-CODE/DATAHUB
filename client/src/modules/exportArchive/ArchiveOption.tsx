import { Archive } from 'lucide-react';
import { Checkbox, TextInput } from '@/components/ui/Inputs';

export interface ArchiveOptionValue { enabled: boolean; note: string }

/** "Keep a copy in the system" — passed to the export dialog as its `extra` section */
export function ArchiveOption({ value, onChange }: { value: ArchiveOptionValue; onChange: (v: ArchiveOptionValue) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <Checkbox checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })}
        label={<span className="inline-flex items-center gap-1.5 font-medium"><Archive className="h-4 w-4 text-primary" />บันทึกสำเนาเก็บเข้าระบบ (ดูย้อนหลังได้ในเมนู “เอกสารที่ออกแล้ว”)</span>} />
      {value.enabled && <TextInput value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder="หมายเหตุ (ไม่บังคับ)" maxLength={500} />}
    </div>
  );
}
