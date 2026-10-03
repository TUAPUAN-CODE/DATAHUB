import { useCallback, useEffect, useRef, useState } from 'react';
import { Boxes, Trash2 } from 'lucide-react';
import type { LinesCfg } from '@/api/endpoints';
import { loadCols } from '@/lib/dashCols';
import { toast } from '@/store/ui';
import type { Column, Row } from '@/types';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Inputs';
import { Modal } from '@/components/ui/Modal';
import { CellDisplay } from '@/components/sheet/CellView';
import { linesApi } from '../scan/api';
import { beep } from '../scan/beep';
import { CameraBox } from '../scan/CameraScanner';

/** The line items of one row (the materials on a trolley): scan to add, remove, and run one action on all of them */
export function LinesDialog({ open, onClose, sheetId, headerRow, headerLabel, cfg, canWrite, onDone }: {
  open: boolean; onClose: () => void; sheetId: string; headerRow: Row | null; headerLabel: string; cfg: LinesCfg; canWrite: boolean; onDone: () => void;
}) {
  const [cols, setCols] = useState<Column[]>([]);
  const [lines, setLines] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const shown = cols.filter((c) => (cfg.displayColumnIds?.length ? cfg.displayColumnIds.includes(c.id) : true)).slice(0, 12);

  const load = useCallback(async () => {
    if (!headerRow) return;
    try { setLines((await linesApi.list(sheetId, headerRow.id)).lines); } catch (e) { setErr(msg(e)); }
  }, [sheetId, headerRow]);
  useEffect(() => { if (open) { setErr(''); setText(''); void loadCols(cfg.lineSheetId).then((c) => setCols(c.filter((x) => !x.isDeleted))); void load(); requestAnimationFrame(() => input.current?.focus()); } }, [open, load, cfg.lineSheetId]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setErr('');
    try { await fn(); if (ok) toast.success(ok); beep(true); await load(); onDone(); } catch (e) { beep(false); setErr(msg(e)); } finally { setBusy(false); requestAnimationFrame(() => input.current?.focus()); }
  };
  const add = (fromCamera?: string) => { const t = (fromCamera ?? text).trim(); if (!t || !headerRow || busy) return; setText(''); void run(() => linesApi.add(sheetId, headerRow.id, { text: t })); };

  return (
    <Modal open={open} onClose={onClose} size="xl" icon={<Boxes className="h-5 w-5" />} title={`รายการใน ${headerLabel || `แถว #${headerRow?.order ?? ''}`}`} description={`${lines.length} รายการ`}>
      <div className="space-y-3">
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <TextInput ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="สแกน QR ของรายการที่จะเพิ่ม แล้วกด Enter" className="!h-9 min-w-[16rem] flex-1 font-mono" disabled={busy} autoComplete="off" />
            {(cfg.actions ?? []).map((a, i) => (
              <Button key={i} size="sm" variant="secondary" disabled={busy || !lines.length || !a.columnId} onClick={() => void run(async () => { const r = await linesApi.action(sheetId, headerRow!.id, i); toast.success(`${a.label || 'ทำรายการ'}: ${r.count} รายการ`); })}>{a.label || `ปุ่ม ${i + 1}`}</Button>
            ))}
          </div>
        )}
        {canWrite && <CameraBox onText={(t) => add(t)} busy={busy} />}
        {err && <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-sm text-danger">{err}</p>}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr className="bg-ink/5 text-left text-xs text-muted"><th className="px-3 py-1.5">#</th>{shown.map((c) => <th key={c.id} className="px-3 py-1.5">{c.name}</th>)}<th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-1.5 text-muted">{l.order}</td>
                  {shown.map((c) => <td key={c.id} className="px-3 py-1.5"><CellDisplay col={c} value={l.values[c.id]} /></td>)}
                  <td className="px-2 text-right">{canWrite && <button type="button" title="เอารายการออกจากแถวนี้" onClick={() => void run(() => linesApi.remove(sheetId, headerRow!.id, l.id))} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={shown.length + 2} className="p-6 text-center text-muted">ยังไม่มีรายการ{canWrite ? ' — สแกน QR เพื่อเพิ่ม' : ''}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
const msg = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ?? (e as Error).message;
