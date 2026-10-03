import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { filesApi, type ScanProfile, type ScanVerify } from '@/api/endpoints';
import { loadCols } from '@/lib/dashCols';
import type { Column, Sheet } from '@/types';
import { Button } from '@/components/ui/Button';
import { Field, Select, Toggle } from '@/components/ui/Inputs';
import { FilePicker, PickedFile } from '@/components/files/FilePicker';

/** Check the scanned value against a list in another sheet (e.g. EPC → trolley register) and copy columns from the row found */
export function VerifyEditor({ p, columns, onChange, fileId, fileName }: { p: ScanProfile; columns: Column[]; onChange: (p: ScanProfile) => void; fileId: string; fileName: string }) {
  const v = p.verify ?? null;
  const [picked, setPicked] = useState<PickedFile | null>(v?.sheetId ? null : { id: fileId, name: fileName, path: 'ไฟล์นี้' });
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [refCols, setRefCols] = useState<Column[]>([]);
  useEffect(() => {
    if (!picked) return;
    let live = true;
    filesApi.get(picked.id).then((r) => live && setSheets(r.sheets)).catch(() => live && setSheets([]));
    return () => { live = false; };
  }, [picked]);
  useEffect(() => {
    let live = true;
    if (v?.sheetId) void loadCols(v.sheetId).then((c) => live && setRefCols(c.filter((x) => !x.isDeleted))).catch(() => live && setRefCols([]));
    else setRefCols([]);
    return () => { live = false; };
  }, [v?.sheetId]);
  // an existing profile: find the file of its sheet so the picker shows it
  useEffect(() => {
    if (!v?.sheetId || picked) return;
    let live = true;
    void (async () => {
      const files = await filesApi.accessible('').catch(() => []);
      for (const f of files.slice(0, 80)) {
        const r = await filesApi.get(f.id).catch(() => null);
        if (r?.sheets.some((s) => s.id === v.sheetId)) { if (live) setPicked({ id: f.id, name: r.file.name, path: r.breadcrumb.map((c) => c.name).join(' / ') }); return; }
      }
    })();
    return () => { live = false; };
  }, [v?.sheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (n: Partial<ScanVerify>) => v && onChange({ ...p, verify: { ...v, ...n } });
  const mapped = columns.filter((c) => p.fields.some((f) => f.columnId === c.id));
  const fill = v?.fill ?? [];
  return (
    <div className="space-y-2 rounded-lg bg-primary/[.04] p-2.5">
      <Toggle checked={!!v} onChange={(on) => onChange({ ...p, verify: on ? { sheetId: '', refKeyColumnId: '', checkColumnId: p.keyColumnId ?? null, fill: [], onMiss: 'reject' } : null })}
        label={<span className="text-sm font-medium">ตรวจค่าที่สแกนกับตารางอื่นก่อนบันทึก (เช่น EPC → ทะเบียนรถเข็น)</span>} />
      {v && (
        <>
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="ไฟล์ของตารางที่ใช้ตรวจ"><FilePicker value={picked} onChange={(f) => { setPicked(f); set({ sheetId: '', refKeyColumnId: '', fill: [] }); }} /></Field>
            <Field label="ชีต"><Select value={v.sheetId} onChange={(e) => set({ sheetId: e.target.value, refKeyColumnId: '', fill: [] })}><option value="">— เลือกชีต —</option>{sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="คอลัมน์ในตารางนั้นที่ต้องตรงกับค่าที่สแกน" hint="เช่น EPC"><Select value={v.refKeyColumnId} onChange={(e) => set({ refKeyColumnId: e.target.value })} disabled={!v.sheetId}><option value="">— เลือก —</option>{refCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="ข้อมูลที่ใช้ตรวจ (คอลัมน์ของชีตนี้)" hint="ต้องเป็นคอลัมน์ที่รับข้อมูลชุดใดชุดหนึ่งจากการสแกน">
              <Select value={v.checkColumnId ?? ''} onChange={(e) => set({ checkColumnId: e.target.value || null })}><option value="">— เลือก —</option>{mapped.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            <Field label="ถ้าไม่พบในตารางนั้น">
              <Select value={v.onMiss} onChange={(e) => set({ onMiss: e.target.value as 'reject' | 'allow' })}><option value="reject">ไม่บันทึก แจ้งว่าไม่พบ (การอ่านจะขึ้นเป็นผิดพลาดในหน้าอุปกรณ์)</option><option value="allow">บันทึกต่อโดยไม่เติมค่า</option></Select>
            </Field>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted">ถ้าพบ ให้เติมค่าจากแถวนั้นมาที่ชีตนี้ (ค่าที่สแกนมาเองมีความสำคัญกว่า)</p>
            {fill.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <Select value={f.fromColumnId} onChange={(e) => set({ fill: fill.map((x, k) => (k === i ? { ...x, fromColumnId: e.target.value } : x)) })}><option value="">คอลัมน์ในตารางตรวจ</option>{refCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <span className="text-muted">→</span>
                <Select value={f.toColumnId} onChange={(e) => set({ fill: fill.map((x, k) => (k === i ? { ...x, toColumnId: e.target.value } : x)) })}><option value="">คอลัมน์ในชีตนี้</option>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <button type="button" onClick={() => set({ fill: fill.filter((_, k) => k !== i) })} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!v.sheetId || fill.length >= 20} onClick={() => set({ fill: [...fill, { fromColumnId: '', toColumnId: '' }] })}>เพิ่มคอลัมน์ที่เติม</Button>
          </div>
        </>
      )}
    </div>
  );
}
