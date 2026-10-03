import { useRef, useState } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { toast } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Inputs';
import { CameraScanner } from './CameraScanner';
import { beep } from './beep';

const msg = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ?? (e as Error).message;

/** Whole-row scan inside the add / edit form: one QR (any format set for the sheet) fills many fields; nothing is saved until the form is saved */
export function RowScanBar({ resolve }: { resolve: (text: string) => Promise<{ count: number; profile: string }> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = async (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const r = await resolve(v);
      beep(true);
      toast.success(`เติมข้อมูล ${r.count} ช่องจาก “${r.profile}”`);
      setText('');
      setOpen(false);
    } catch (e) { beep(false); toast.error(msg(e), 'สแกนไม่สำเร็จ'); setText(''); } finally { setBusy(false); requestAnimationFrame(() => input.current?.focus()); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[.04] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <ScanLine className="h-4 w-4 text-primary" />
        <TextInput ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(text); } }}
          placeholder="สแกน QR เพื่อเติมทั้งแถว (เครื่องสแกนยิงที่ช่องนี้ได้เลย)" className="!h-9 min-w-[14rem] flex-1 font-mono" disabled={busy} autoComplete="off" />
        <Button size="sm" variant="secondary" icon={<Camera className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>{open ? 'ปิดกล้อง' : 'กล้อง'}</Button>
      </div>
      {open && <CameraScanner onText={(t) => void run(t)} busy={busy} onClose={() => setOpen(false)} />}
    </div>
  );
}
