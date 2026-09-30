import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History, RotateCcw, Rows3, Trash2, Undo2 } from 'lucide-react';
import { apiError } from '@/api/client';
import { CellVersion, cellsApi, rowsApi } from '@/api/endpoints';
import { useLoad } from '@/hooks';
import { cn } from '@/lib/cn';
import { displayValue, fmtDateTime, relTime } from '@/lib/format';
import { confirmDialog, toast } from '@/store/ui';
import type { CellValue, Column, Row } from '@/types';
import { Button } from '../ui/Button';
import { Checkbox, Field, TextArea, TextInput } from '../ui/Inputs';
import { Avatar, EmptyState, Skeleton } from '../ui/misc';
import { Modal } from '../ui/Modal';
import { FieldInput } from './FieldInput';

const SOURCE: Record<string, string> = { edit: 'แก้ไข', create: 'สร้าง', paste: 'วาง', rollback: 'ย้อนค่า', type_change: 'แปลงชนิด', undo: 'ย้อนกลับ', fill: 'เติม' };

/* ---------------- Row form (add / edit) ---------------- */
export function RowFormModal({ open, onClose, columns, row, users, canWrite, onCreate, onSave }: {
  open: boolean; onClose: () => void; columns: Column[]; row: Row | null; users: Record<string, { name: string }>; canWrite: boolean;
  onCreate: (values: Record<string, CellValue>) => Promise<unknown>; onSave: (changes: { columnId: string; value: CellValue }[]) => Promise<unknown>;
}) {
  const [values, setValues] = useState<Record<string, CellValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const init = () => {
    const v: Record<string, CellValue> = {};
    columns.forEach((c) => { v[c.id] = row ? row.values[c.id] ?? null : c.defaultValue ?? null; });
    setValues(v);
    setErrors({});
  };
  useEffect(() => { if (open) init(); }, [open, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = (v: CellValue) => v === null || v === '' || (Array.isArray(v) && !v.length);
  const submit = async () => {
    const errs: Record<string, string> = {};
    columns.forEach((c) => { if (c.isRequired && empty(values[c.id] ?? null)) errs[c.id] = 'จำเป็นต้องกรอก'; });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (row) {
        const changes = columns.filter((c) => JSON.stringify(row.values[c.id] ?? null) !== JSON.stringify(values[c.id] ?? null)).map((c) => ({ columnId: c.id, value: values[c.id] ?? null }));
        if (changes.length) await onSave(changes);
        onClose();
      } else {
        await onCreate(values);
        toast.success('เพิ่มแถวแล้ว');
        if (again) init(); else onClose();
      }
    } catch (e) {
      const info = apiError(e);
      if (info.details?.fields) setErrors(info.details.fields);
      toast.error(info.message, 'บันทึกไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Rows3 className="h-5 w-5" />} title={row ? `แถว #${row.order}` : 'เพิ่มแถวใหม่'}
      description={row ? `สร้างโดย ${users[row.createdBy]?.name ?? 'ผู้ใช้'} · ${fmtDateTime(row.createdAt)}` : 'ช่องที่มี * จำเป็นต้องกรอก'}
      footer={<>
        {!row && <Checkbox checked={again} onChange={setAgain} label="เพิ่มต่ออีกแถว" className="mr-auto" />}
        <Button variant="secondary" onClick={onClose}>{canWrite ? 'ยกเลิก' : 'ปิด'}</Button>
        {canWrite && <Button onClick={submit} loading={busy}>{row ? 'บันทึก' : 'เพิ่มแถว'}</Button>}
      </>}>
      <div className="grid max-h-[62vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
        {columns.map((c, i) => (
          <Field key={c.id} label={c.name} required={c.isRequired} error={errors[c.id]} className={cn((c.dataType === 'text' || c.dataType === 'multi_select') && 'sm:col-span-2')}
            hint={row?.meta[c.id] ? `แก้ไขล่าสุด ${users[row.meta[c.id].by]?.name ?? ''} · ${relTime(row.meta[c.id].at)}` : c.description ?? undefined}>
            {canWrite ? <FieldInput col={c} value={values[c.id]} onChange={(v) => setValues({ ...values, [c.id]: v })} invalid={!!errors[c.id]} autoFocus={i === 0} />
              : <div className="min-h-10 rounded-xl bg-ink/[.03] px-3 py-2.5 text-sm">{displayValue(c, values[c.id] ?? null) || <span className="text-muted">—</span>}</div>}
          </Field>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------- Cell history ---------------- */
export function CellHistoryModal({ target, onClose, onChanged }: { target: { row: Row; col: Column } | null; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useLoad(() => (target ? cellsApi.history(target.row.id, target.col.id) : Promise.resolve(null)), [target?.row.id, target?.col.id], { skip: !target });
  const show = (v: CellValue) => (target ? displayValue(target.col, v) : '') || <span className="italic text-muted">ว่าง</span>;
  const restore = async (v: CellVersion) => {
    if (!(await confirmDialog({ title: 'คืนค่าเซลล์เป็นเวอร์ชันนี้?', message: `ค่าจะถูกตั้งเป็น “${target ? displayValue(target.col, v.newValue) || 'ว่าง' : ''}” และบันทึกเป็นการแก้ไขใหม่` }))) return;
    try { await cellsApi.rollback(v.id, 'new'); toast.success('คืนค่าแล้ว'); void reload(true); onChanged(); } catch (e) { toast.error(e); }
  };
  return (
    <Modal open={!!target} onClose={onClose} icon={<History className="h-5 w-5" />} size="md"
      title={target ? `ประวัติเซลล์ · ${target.col.name}` : ''} description={target ? `แถว #${target.row.order}` : ''}>
      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          : !data?.versions.length ? <EmptyState icon={<History />} title="ยังไม่มีประวัติ" description="เซลล์นี้ยังไม่เคยถูกแก้ไข" />
          : (
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {data.versions.map((v, i) => (
                <li key={v.id} className="relative">
                  <span className={cn('absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-surface', i === 0 ? 'bg-primary' : 'bg-ink/25')} />
                  <div className="flex items-center gap-2 text-[13px]">
                    <Avatar name={v.byName} src={v.avatarUrl} size={22} />
                    <span className="font-medium">{v.byName}</span>
                    <span className="rounded bg-ink/5 px-1.5 text-[11px] text-muted">{SOURCE[v.source] ?? v.source}</span>
                    <span className="ml-auto text-xs text-muted" title={fmtDateTime(v.at)}>{relTime(v.at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-ink/[.03] px-3 py-2 text-sm">
                    <span className="text-muted line-through decoration-danger/50">{show(v.oldValue)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted" />
                    <span className="font-medium">{show(v.newValue)}</span>
                    {data.canRollback && i > 0 && <Button size="sm" variant="ghost" className="ml-auto !h-7" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => restore(v)}>คืนค่านี้</Button>}
                  </div>
                </li>
              ))}
            </ol>
          )}
      </div>
    </Modal>
  );
}

/* ---------------- Row history ---------------- */
export function RowHistoryModal({ row, columns, canRollback, onClose, onChanged }: { row: Row | null; columns: Column[]; canRollback: boolean; onClose: () => void; onChanged: () => void }) {
  const { data, loading } = useLoad(() => (row ? rowsApi.history(row.id) : Promise.resolve(null)), [row?.id], { skip: !row });
  const colMap = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const show = (colId: string, v: CellValue) => { const c = colMap.get(colId); return (c ? displayValue(c, v) : v === null ? '' : String(v)) || '—'; };
  const rollback = async (at: string) => {
    if (!row) return;
    const ts = new Date(new Date(at).getTime() + 1).toISOString();
    if (!(await confirmDialog({ title: 'ย้อนแถวกลับไปที่จุดนี้?', message: `ทุกเซลล์ของแถว #${row.order} จะกลับไปเป็นค่า ณ ${fmtDateTime(at)} (บันทึกเป็นการแก้ไขใหม่ ย้อนกลับได้อีก)`, confirmText: 'ย้อนข้อมูล' }))) return;
    try { const r = await rowsApi.rollback(row.id, { at: ts }); toast.success('ย้อนข้อมูลแถวแล้ว', `เปลี่ยน ${r.cellsChanged} เซลล์`); onChanged(); onClose(); } catch (e) { toast.error(e); }
  };
  return (
    <Modal open={!!row} onClose={onClose} size="lg" icon={<History className="h-5 w-5" />} title={row ? `ประวัติแถว #${row.order}` : ''} description="ทุกการเปลี่ยนแปลงของแถวนี้ เรียงจากล่าสุด">
      <div className="max-h-[62vh] overflow-y-auto">
        {loading ? <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          : !data?.history.length ? <EmptyState icon={<History />} title="ยังไม่มีประวัติ" />
          : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3 font-medium">เวลา</th><th className="pr-3 font-medium">ผู้แก้ไข</th><th className="pr-3 font-medium">คอลัมน์</th><th className="pr-3 font-medium">เปลี่ยนแปลง</th><th /></tr></thead>
              <tbody className="divide-y divide-line">
                {data.history.map((h, i) => (
                  <tr key={h.id} className="align-top">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{fmtDateTime(h.at)}</td>
                    <td className="py-2.5 pr-3"><span className="inline-flex items-center gap-1.5"><Avatar name={h.byName} src={h.avatarUrl} size={20} /><span className="truncate">{h.byName}</span></span></td>
                    <td className="py-2.5 pr-3 font-medium">{h.columnName}</td>
                    <td className="py-2.5 pr-3"><span className="text-muted line-through decoration-danger/40">{show(h.columnId, h.oldValue)}</span> → <span>{show(h.columnId, h.newValue)}</span></td>
                    <td className="py-2 text-right">{canRollback && i > 0 && <Button size="sm" variant="ghost" className="!h-7 whitespace-nowrap" onClick={() => rollback(h.at)}>ย้อนถึงจุดนี้</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </Modal>
  );
}

/* ---------------- Sheet point-in-time rollback (admin) ---------------- */
export function RollbackModal({ open, onClose, sheetId, sheetName, onDone }: { open: boolean; onClose: () => void; sheetId: string; sheetName: string; onDone: () => void }) {
  const [at, setAt] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ cells: number; rowsToDelete: number; rowsToRestore: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAt(''); setReason(''); setPreview(null); } }, [open]);
  const iso = at ? new Date(at).toISOString() : '';
  const doPreview = async () => {
    setBusy(true);
    try { setPreview(await rowsApi.sheetRollback(sheetId, { at: iso, preview: true })); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!(await confirmDialog({ title: `ย้อนข้อมูลทั้งชีต “${sheetName}”?`, message: 'การย้อนจะถูกบันทึกเป็นการแก้ไขใหม่ทั้งหมด และสามารถย้อนกลับได้อีกครั้งจากประวัติ', danger: true, confirmText: 'ย้อนข้อมูลทั้งชีต' }))) return;
    setBusy(true);
    try {
      const r = await rowsApi.sheetRollback(sheetId, { at: iso, reason });
      toast.success('ย้อนข้อมูลแล้ว', `เซลล์ ${r.cellsChanged} · ลบแถว ${r.rowsDeleted} · กู้คืนแถว ${r.rowsRestored}`);
      onDone();
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="md" icon={<RotateCcw className="h-5 w-5" />} title="ย้อนข้อมูลทั้งชีตไปยังเวลาที่เลือก" description="ใช้กู้คืนเมื่อมีการแก้ไขผิดพลาดจำนวนมาก (โครงสร้างคอลัมน์จะไม่ถูกเปลี่ยน)"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="secondary" onClick={doPreview} disabled={!at} loading={busy && !preview}>ดูผลกระทบ</Button>
        <Button variant="danger" onClick={apply} disabled={!preview || reason.trim().length < 5} loading={busy && !!preview}>ย้อนข้อมูล</Button></>}>
      <div className="space-y-4">
        <Field label="ย้อนกลับไปยังเวลา" required><TextInput type="datetime-local" value={at} onChange={(e) => { setAt(e.target.value); setPreview(null); }} max={new Date().toISOString().slice(0, 16)} /></Field>
        {preview && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['เซลล์ที่จะเปลี่ยน', preview.cells], ['แถวที่จะลบ', preview.rowsToDelete], ['แถวที่จะกู้คืน', preview.rowsToRestore]].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-ink/[.04] px-2 py-3"><p className="text-xl font-semibold tabular-nums">{Number(n).toLocaleString()}</p><p className="text-xs text-muted">{l}</p></div>
            ))}
          </div>
        )}
        <Field label="เหตุผล" required hint="จะถูกบันทึกลงประวัติการแก้ไข"><TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น นำเข้าข้อมูลผิดไฟล์เมื่อเช้านี้" /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- Deleted rows ---------------- */
export function SheetTrashModal({ open, onClose, sheetId, columns, onRestored }: { open: boolean; onClose: () => void; sheetId: string; columns: Column[]; onRestored: () => void }) {
  const { data, loading, reload } = useLoad(() => rowsApi.trash(sheetId), [sheetId, open], { skip: !open });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => setPicked(new Set()), [open]);
  const shown = columns.slice(0, 4);
  const restore = async () => {
    setBusy(true);
    try { const r = await rowsApi.restore(sheetId, [...picked]); toast.success(`กู้คืน ${r.restored} แถวแล้ว`); setPicked(new Set()); void reload(true); onRestored(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Trash2 className="h-5 w-5" />} title="แถวที่ถูกลบ" description="เลือกแถวที่ต้องการกู้คืนกลับเข้าชีต"
      footer={<><Button variant="secondary" onClick={onClose}>ปิด</Button><Button icon={<RotateCcw className="h-4 w-4" />} disabled={!picked.size} loading={busy} onClick={restore}>กู้คืน {picked.size || ''} แถว</Button></>}>
      <div className="max-h-[60vh] overflow-auto">
        {loading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          : !data?.rows.length ? <EmptyState icon={<Trash2 />} title="ไม่มีแถวที่ถูกลบ" />
          : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr>
                <th className="w-8 py-2"><Checkbox checked={picked.size === data.rows.length} onChange={(v) => setPicked(v ? new Set(data.rows.map((r) => r.id)) : new Set())} /></th>
                <th className="pr-3 font-medium">#</th>{shown.map((c) => <th key={c.id} className="pr-3 font-medium">{c.name}</th>)}<th className="pr-3 font-medium">ลบโดย</th><th className="font-medium">เมื่อ</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-ink/[.03]" onClick={() => { const n = new Set(picked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setPicked(n); }}>
                    <td className="py-2"><Checkbox checked={picked.has(r.id)} onChange={() => undefined} /></td>
                    <td className="pr-3 text-muted">{r.order}</td>
                    {shown.map((c) => <td key={c.id} className="max-w-[180px] truncate pr-3">{displayValue(c, r.values[c.id] ?? null)}</td>)}
                    <td className="pr-3">{data.users[r.deletedBy ?? '']?.name ?? '—'}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{relTime(r.deletedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </Modal>
  );
}
