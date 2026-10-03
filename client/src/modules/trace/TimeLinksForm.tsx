import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { filesApi, type TimeLinkCfg } from '@/api/endpoints';
import { loadCols } from '@/lib/dashCols';
import type { Column, Sheet } from '@/types';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Inputs';
import { FilePicker, PickedFile } from '@/components/files/FilePicker';

const newLink = (): TimeLinkCfg => ({ id: Math.random().toString(36).slice(2, 10), name: 'เชื่อมตามช่วงเวลา', targetSheetId: '', aStartColumnId: '', aEndColumnId: null, aKeyColumnId: null, bStartColumnId: '', bEndColumnId: null, bKeyColumnId: null, toleranceMin: 0, windowHours: 72 });
const isTime = (c: Column) => c.dataType === 'datetime' || c.dataType === 'date';

/** Settings: link this table to another one through time (rows whose time windows overlap are "the same batch"), optionally also the same line / key */
export function TimeLinksForm({ links, onChange, columns }: { links: TimeLinkCfg[]; onChange: (l: TimeLinkCfg[]) => void; columns: Column[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">เช่น ตารางนี้เก็บ flow วัตถุดิบ (เริ่มบรรจุ–บรรจุเสร็จ) เชื่อมกับตาราง flow บรรจุภัณฑ์ (เริ่มใช้–เลิกใช้): แถวที่ช่วงเวลาซ้อนทับกันถือว่าเกี่ยวข้องกัน และเลือกให้ตรงไลน์/รหัสเดียวกันด้วยได้ — ดูผลในหน้า “ย้อนรอย” ทั้งสองทิศ</p>
      {links.map((l, i) => <LinkCard key={l.id} l={l} columns={columns} onChange={(n) => onChange(links.map((x, k) => (k === i ? n : x)))} onRemove={() => onChange(links.filter((_, k) => k !== i))} />)}
      <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={links.length >= 10} onClick={() => onChange([...links, newLink()])}>เพิ่มการเชื่อมตามเวลา</Button>
    </div>
  );
}

function LinkCard({ l, columns, onChange, onRemove }: { l: TimeLinkCfg; columns: Column[]; onChange: (l: TimeLinkCfg) => void; onRemove: () => void }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [cols, setCols] = useState<Column[]>([]);
  useEffect(() => { if (file) void filesApi.get(file.id).then((r) => setSheets(r.sheets)).catch(() => setSheets([])); }, [file]);
  useEffect(() => { if (l.targetSheetId) void loadCols(l.targetSheetId).then((c) => setCols(c.filter((x) => !x.isDeleted))).catch(() => setCols([])); else setCols([]); }, [l.targetSheetId]);
  // an existing link: find the file of its sheet once so the picker shows it
  useEffect(() => {
    if (!l.targetSheetId || file) return;
    let live = true;
    void (async () => {
      const files = await filesApi.accessible('').catch(() => []);
      for (const f of files.slice(0, 80)) {
        const r = await filesApi.get(f.id).catch(() => null);
        if (r?.sheets.some((s) => s.id === l.targetSheetId)) { if (live) setFile({ id: f.id, name: r.file.name, path: r.breadcrumb.map((c) => c.name).join(' / ') }); return; }
      }
    })();
    return () => { live = false; };
  }, [l.targetSheetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<TimeLinkCfg>) => onChange({ ...l, ...p });
  const sel = (value: string | null | undefined, list: Column[], onPick: (v: string | null) => void, empty = '— เลือก —') => (
    <Select value={value ?? ''} onChange={(e) => onPick(e.target.value || null)}><option value="">{empty}</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
  );
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Field label="ชื่อการเชื่อม"><TextInput value={l.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <button type="button" onClick={onRemove} className="mt-6 rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" title="ลบ"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="ตารางที่เชื่อม: ไฟล์ (โฟลเดอร์ › โฟลเดอร์ย่อย › ไฟล์)"><FilePicker value={file} onChange={(f) => { setFile(f); set({ targetSheetId: '', bStartColumnId: '', bEndColumnId: null, bKeyColumnId: null }); }} /></Field>
        <Field label="ตาราง (ชีต)"><Select value={l.targetSheetId} onChange={(e) => set({ targetSheetId: e.target.value, bStartColumnId: '', bEndColumnId: null, bKeyColumnId: null })} disabled={!file}><option value="">— เลือกตาราง —</option>{sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg bg-primary/[.04] p-2">
          <p className="text-xs font-medium">ตารางนี้ (เวลาของแถว)</p>
          <Field label="เริ่ม">{sel(l.aStartColumnId, columns.filter(isTime), (v) => set({ aStartColumnId: v ?? '' }))}</Field>
          <Field label="สิ้นสุด (ว่าง = ยังไม่จบ นับถึงตอนนี้)">{sel(l.aEndColumnId, columns.filter(isTime), (v) => set({ aEndColumnId: v }), '— ไม่มี —')}</Field>
          <Field label="ต้องตรงกัน (ไม่บังคับ) เช่น ไลน์">{sel(l.aKeyColumnId, columns, (v) => set({ aKeyColumnId: v }), '— ไม่ใช้ —')}</Field>
        </div>
        <div className="space-y-2 rounded-lg bg-primary/[.04] p-2">
          <p className="text-xs font-medium">ตารางที่เชื่อม</p>
          <Field label="เริ่ม">{sel(l.bStartColumnId, cols.filter(isTime), (v) => set({ bStartColumnId: v ?? '' }))}</Field>
          <Field label="สิ้นสุด">{sel(l.bEndColumnId, cols.filter(isTime), (v) => set({ bEndColumnId: v }), '— ไม่มี —')}</Field>
          <Field label="ต้องตรงกัน (ไม่บังคับ)">{sel(l.bKeyColumnId, cols, (v) => set({ bKeyColumnId: v }), '— ไม่ใช้ —')}</Field>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="เหลื่อมเวลาได้ (นาที)" hint="ช่วงห่างกันไม่เกินนี้ยังนับว่าเชื่อมกัน"><TextInput type="number" min={0} value={l.toleranceMin ?? 0} onChange={(e) => set({ toleranceMin: Number(e.target.value) || 0 })} /></Field>
        <Field label="แถวในตารางที่เชื่อมใช้เวลานานสุด (ชั่วโมง)" hint="ใช้จำกัดการค้นให้เร็ว (ตารางหลักล้านแถว)"><TextInput type="number" min={1} value={l.windowHours ?? 72} onChange={(e) => set({ windowHours: Number(e.target.value) || 72 })} /></Field>
      </div>
    </div>
  );
}
