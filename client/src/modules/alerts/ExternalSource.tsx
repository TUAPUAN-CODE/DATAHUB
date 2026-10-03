import { useEffect, useState } from 'react';
import { filesApi } from '@/api/endpoints';
import { columnsApi } from '@/api/endpoints';
import { loadCols } from '@/lib/dashCols';
import { toast } from '@/store/ui';
import type { Column, ColumnDraft, Sheet } from '@/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select } from '@/components/ui/Inputs';
import { FilePicker, PickedFile } from '@/components/files/FilePicker';

export type ExtRole = 'start' | 'end' | 'limit';
const ROLE_LABEL: Record<ExtRole, string> = { start: 'เวลาเริ่ม', end: 'เวลาสิ้นสุด', limit: 'เวลามาตรฐาน (นาที)' };
const esc = (n: string) => n.replace(/\]/g, ']]');

/**
 * Take the start / end / standard time of the colour alert from ANOTHER table: pick folder › sub-folder › file, the sheet and the column,
 * and which column of this sheet matches which column of that sheet. A helper formula column (LOOKUP) is made for it, so the alert
 * keeps reading plain columns of this sheet and the values follow the other table automatically.
 */
export function ExternalSource({ role, sheetId, local, onCreated, onCancel }: {
  role: ExtRole; sheetId: string; local: ColumnDraft[]; onCreated: (draft: ColumnDraft) => void; onCancel: () => void;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [srcSheet, setSrcSheet] = useState('');
  const [cols, setCols] = useState<Column[]>([]);
  const [valueCol, setValueCol] = useState('');
  const [keyCol, setKeyCol] = useState('');
  const [localKey, setLocalKey] = useState('');
  const [asHM, setAsHM] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (file) void filesApi.get(file.id).then((r) => setSheets(r.sheets)).catch(() => setSheets([])); }, [file]);
  useEffect(() => { if (srcSheet) void loadCols(srcSheet).then((c) => setCols(c.filter((x) => !x.isDeleted))).catch(() => setCols([])); else setCols([]); }, [srcSheet]);

  const val = cols.find((c) => c.id === valueCol);
  const key = cols.find((c) => c.id === keyCol);
  const loc = local.find((c) => c.id === localKey);
  const ready = !!(srcSheet && val && key && loc);
  const sheetName = sheets.find((s) => s.id === srcSheet)?.name ?? '';

  const create = async () => {
    if (!val || !key || !loc) return;
    setBusy(true);
    try {
      const lookup = `LOOKUP(@src1[${esc(val.name)}], @src1[${esc(key.name)}], [${esc(loc.name)}])`;
      const expr = role === 'limit' && asHM ? `HM(${lookup})` : lookup;
      const dataType = role === 'limit' ? 'float' : 'datetime';
      const name = `${ROLE_LABEL[role].replace(/ \(นาที\)/, '')} (จาก ${sheetName} › ${val.name})`.slice(0, 190);
      const validation = { formula: { expr, sources: [{ alias: 'src1', sheetId: srcSheet }] } };
      const created = await columnsApi.create(sheetId, { name, dataType, isRequired: false, width: 160, defaultValue: null, placeholder: null, description: null, validation, options: [] });
      toast.success(`สร้างคอลัมน์ “${name}” แล้ว`, 'ค่าจะอัปเดตตามตารางต้นทางอัตโนมัติ');
      onCreated({ key: created.id, id: created.id, name, dataType, isRequired: false, width: 160, defaultValue: null, placeholder: null, description: null, validation, options: [] });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-surface p-3">
      <p className="text-sm font-medium">ดึง “{ROLE_LABEL[role]}” จากตารางอื่น</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="1) ไฟล์ (โฟลเดอร์ › โฟลเดอร์ย่อย › ไฟล์)"><FilePicker value={file} onChange={(f) => { setFile(f); setSrcSheet(''); setValueCol(''); setKeyCol(''); }} /></Field>
        <Field label="2) ตาราง (ชีต)"><Select value={srcSheet} onChange={(e) => { setSrcSheet(e.target.value); setValueCol(''); setKeyCol(''); }} disabled={!file}><option value="">— เลือกตาราง —</option>{sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="3) คอลัมน์ที่ต้องการดึงค่า"><Select value={valueCol} onChange={(e) => setValueCol(e.target.value)} disabled={!srcSheet}><option value="">— เลือกคอลัมน์ —</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="4) จับคู่: คอลัมน์ในตารางนี้"><Select value={localKey} onChange={(e) => setLocalKey(e.target.value)}><option value="">— เลือก —</option>{local.filter((c) => c.id).map((c) => <option key={c.key} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="= คอลัมน์ในตารางนั้น"><Select value={keyCol} onChange={(e) => setKeyCol(e.target.value)} disabled={!srcSheet}><option value="">— เลือก —</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        </div>
      </div>
      <p className="text-[11px] text-muted">เช่น คอลัมน์ “ประเภทวัตถุดิบ” ของตารางนี้ = “ประเภท” ของตารางเกณฑ์เวลา → ดึง “เตรียม→เย็น” มาเป็นเวลามาตรฐานของแต่ละแถว (ผู้ใช้ไม่ต้องมีสิทธิ์เปิดตารางต้นทาง)</p>
      {role === 'limit' && <Checkbox checked={asHM} onChange={setAsHM} label="ค่าในตารางต้นทางเขียนเป็นเวลา เช่น 5 (= 5 ชม.), 5:30, 4.23 (= 4 ชม. 23 นาที) → แปลงเป็นนาที" />}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>ยกเลิก</Button>
        <Button size="sm" onClick={() => void create()} loading={busy} disabled={!ready}>สร้างคอลัมน์ช่วยและใช้</Button>
      </div>
    </div>
  );
}
