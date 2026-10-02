import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import type { ScanProfile } from '@/api/endpoints';
import { Modal } from '@/components/ui/Modal';
import { Select, TextInput } from '@/components/ui/Inputs';
import { scanApi } from './api';
import { beep } from './beep';

interface Entry { at: number; text: string; ok: boolean; message: string }

/** Scan box: a keyboard-wedge scanner / RFID text reader types the text and presses Enter. Stays open for the next scan. */
export function ScanDialog({ open, onClose, sheetId, profiles, onDone }: { open: boolean; onClose: () => void; sheetId: string; profiles: ScanProfile[]; onDone: () => void }) {
  const [text, setText] = useState('');
  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setLog([]); setText(''); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await scanApi.scan(sheetId, t, profileId);
      beep(true);
      setLog((l) => [{ at: Date.now(), text: t, ok: true, message: `${r.action === 'created' ? 'เพิ่มแถว' : r.action === 'ignored' ? 'ไม่เปลี่ยน (ลงเวลาครบแล้ว) แถว' : 'อัปเดตแถว'} #${r.rowNo}${r.stamped ? ` — ลงเวลา “${r.stamped}”` : ''} (${r.profile.name})` }, ...l].slice(0, 30));
      onDone();
    } catch (e) {
      beep(false);
      setLog((l) => [{ at: Date.now(), text: t, ok: false, message: (e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ?? (e as Error).message }, ...l].slice(0, 30));
    } finally { setText(''); setBusy(false); requestAnimationFrame(() => input.current?.focus()); }
  };
  return (
    <Modal open={open} onClose={onClose} size="md" icon={<ScanLine className="h-5 w-5" />} title="สแกน QR Code" description="ยิงเครื่องสแกนที่ช่องด้านล่าง (เครื่องสแกนจะกด Enter ให้เอง) แล้วสแกนต่อได้ทันที">
      <div className="space-y-3">
        <TextInput ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder="สแกนที่นี่…" className="font-mono" disabled={busy} autoComplete="off" />
        {profiles.length > 1 && (
          <Select value={profileId} onChange={(e) => { setProfileId(e.target.value); input.current?.focus(); }}>
            <option value="">รูปแบบ: ตรวจจากข้อความอัตโนมัติ</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
          {log.map((e) => (
            <div key={e.at} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ${e.ok ? 'bg-success/10' : 'bg-danger/10'}`}>
              {e.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
              <div className="min-w-0"><p className={e.ok ? '' : 'text-danger'}>{e.message}</p><p className="truncate font-mono text-[11px] text-muted">{e.text}</p></div>
            </div>
          ))}
          {!log.length && <p className="py-4 text-center text-sm text-muted">ยังไม่มีการสแกน</p>}
        </div>
      </div>
    </Modal>
  );
}
