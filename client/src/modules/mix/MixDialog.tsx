import { useEffect, useMemo, useRef, useState } from 'react';
import { Merge, Trash2 } from 'lucide-react';
import type { MixCfg } from '@/api/endpoints';
import { toast } from '@/store/ui';
import type { Column, Row } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextInput } from '@/components/ui/Inputs';
import { scanApi } from '../scan/api';
import { beep } from '../scan/beep';
import { CameraBox } from '../scan/CameraScanner';

interface Line { row: Row; qty: string }
const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);

/** Pick the rows to mix (scan / type the key, or the ticked rows), choose how much to cut from each, get one new lot */
export function MixDialog({ open, onClose, sheetId, cfg, columns, selectedRows, onDone }: {
  open: boolean; onClose: () => void; sheetId: string; cfg: MixCfg; columns: Column[]; selectedRows: Row[]; onDone: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const deduct = columns.find((c) => c.id === cfg.deductColumnId);
  const keyCol = columns.find((c) => c.id === cfg.keyColumnId);
  const remainingOf = (r: Row) => Number(r.values[cfg.deductColumnId] ?? 0) || 0;
  useEffect(() => { if (open) { setLines([]); setKey(''); setErr(''); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const add = (rows: Row[]) => setLines((cur) => {
    const have = new Set(cur.map((l) => l.row.id));
    return [...cur, ...rows.filter((r) => !have.has(r.id)).map((r) => ({ row: r, qty: fmt(remainingOf(r)) }))];
  });
  const find = async (fromCamera?: string) => {
    const v = (fromCamera ?? key).trim();
    if (!v) return;
    setErr('');
    try { const r = await scanApi.findForMix(sheetId, v); add([r.row]); beep(true); setKey(''); } catch (e) { beep(false); setErr((e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ?? (e as Error).message); }
    requestAnimationFrame(() => input.current?.focus());
  };
  const qtyNum = (l: Line) => Number(l.qty);
  const total = useMemo(() => Math.round(lines.reduce((a, l) => a + (Number.isFinite(qtyNum(l)) ? qtyNum(l) : 0), 0) * 1e6) / 1e6, [lines]);
  const bad = lines.some((l) => !(qtyNum(l) > 0) || qtyNum(l) > remainingOf(l.row) + 1e-9);

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      const r = await scanApi.mix(sheetId, { inputs: lines.map((l) => ({ rowId: l.row.id, qty: qtyNum(l) })) });
      toast.success(`ผสมสำเร็จ ได้แถว #${r.rowNo} รวม ${fmt(r.total)}`);
      beep(true); onDone(); onClose();
    } catch (e) { beep(false); setErr((e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ?? (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Merge className="h-5 w-5" />} title="ผสมวัตถุดิบ" description={`ตัดจากคอลัมน์ “${deduct?.name ?? '?'}” ของแต่ละแถว แล้วสร้างล็อตใหม่ (เลขที่ใหม่ออกอัตโนมัติ)`}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button onClick={confirm} loading={busy} disabled={!lines.length || bad}>ผสม {lines.length} แถว → รวม {fmt(total)}</Button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {keyCol && <TextInput ref={input} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find(); } }} placeholder={`สแกน/พิมพ์ ${keyCol.name} แล้วกด Enter`} className="!h-9 flex-1 font-mono" />}
          {selectedRows.length > 0 && <Button size="sm" variant="secondary" onClick={() => add(selectedRows)}>เพิ่มจากแถวที่ติ๊ก ({selectedRows.length})</Button>}
        </div>
        {keyCol && <CameraBox onText={(t) => void find(t)} />}
        {err && <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-sm text-danger">{err}</p>}
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[3.5rem_1fr_6rem_8rem_2rem] gap-2 bg-ink/5 px-3 py-1.5 text-xs text-muted"><span>แถว</span><span>{keyCol?.name ?? 'รายการ'}</span><span className="text-right">คงเหลือ</span><span>ใช้ผสม</span><span /></div>
          {lines.map((l, i) => {
            const over = qtyNum(l) > remainingOf(l.row) + 1e-9;
            return (
              <div key={l.row.id} className="grid grid-cols-[3.5rem_1fr_6rem_8rem_2rem] items-center gap-2 border-t border-line px-3 py-1.5 text-sm">
                <span>#{l.row.order}</span>
                <span className="truncate font-mono">{keyCol ? String(l.row.values[keyCol.id] ?? '') : ''}</span>
                <span className="text-right">{fmt(remainingOf(l.row))}</span>
                <TextInput type="number" min={0} step="any" value={l.qty} invalid={over || !(qtyNum(l) > 0)} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} className="!h-8" />
                <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          {!lines.length && <p className="p-6 text-center text-sm text-muted">ยังไม่มีแถวที่จะผสม — สแกน/พิมพ์ค่า หรือติ๊กแถวในตารางแล้วกด “เพิ่มจากแถวที่ติ๊ก”</p>}
        </div>
        {bad && <p className="text-xs text-danger">มีแถวที่จำนวนที่ใช้เป็น 0 หรือเกินคงเหลือ</p>}
      </div>
    </Modal>
  );
}
