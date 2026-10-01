import { useEffect, useState } from 'react';
import { filesApi } from '@/api/endpoints';
import { loadCols } from '@/lib/dashCols';
import type { Column, ColumnDraft, Lookup, Sheet } from '@/types';
import { Field, Select, Toggle } from '../ui/Inputs';
import { SearchSelect } from '../ui/SearchSelect';

const OK_SOURCE = (c: Column) => c.dataType !== 'multi_select' && c.dataType !== 'image' && !c.isDeleted;

/**
 * Relationship editor: the options of this column are the values of a column in another sheet.
 * Optionally the list is narrowed to the rows whose "linking column" equals the value of a column in THIS row
 * (e.g. Plant → Line: only the lines that exist for the selected plant).
 */
export function LookupEditor({ lookup, onChange, siblings, selfKey, fileId, fileName, hideParent, title }: {
  lookup: Lookup; onChange: (l: Lookup) => void; siblings: ColumnDraft[]; selfKey: string; fileId?: string; fileName?: string; hideParent?: boolean; title?: string;
}) {
  const [srcFile, setSrcFile] = useState<string | null>(fileId ?? null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [cols, setCols] = useState<Column[]>([]);
  useEffect(() => {
    if (!srcFile) { setSheets([]); return; }
    let live = true;
    filesApi.get(srcFile).then((r) => live && setSheets(r.sheets)).catch(() => live && setSheets([]));
    return () => { live = false; };
  }, [srcFile]);
  useEffect(() => {
    let live = true;
    if (lookup.sheetId) void loadCols(lookup.sheetId).then((c) => live && setCols(c.filter(OK_SOURCE)));
    else setCols([]);
    return () => { live = false; };
  }, [lookup.sheetId]);

  // resolve the file of an existing lookup by scanning accessible files' sheets (only needed once)
  useEffect(() => {
    if (!lookup.sheetId || srcFile) return;
    let live = true;
    void (async () => {
      const files = await filesApi.accessible('').catch(() => []);
      for (const f of files.slice(0, 60)) {
        const r = await filesApi.get(f.id).catch(() => null);
        if (r?.sheets.some((s) => s.id === lookup.sheetId)) { if (live) setSrcFile(f.id); return; }
      }
    })();
    return () => { live = false; };
  }, [lookup.sheetId, srcFile]);

  const parentCandidates = siblings.filter((s) => s.id && s.key !== selfKey && ['varchar', 'select', 'int', 'float', 'date'].includes(s.dataType));
  const hasParent = !!lookup.parent;
  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[.03] p-3 md:col-span-2">
      <p className="text-[13px] font-semibold text-primary">{title ?? 'เชื่อมโยงกับตารางอื่น (Relationship)'}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="ไฟล์ต้นทาง">
          <SearchSelect value={srcFile} placeholder={fileName ?? 'เลือกไฟล์'} onChange={(v) => { setSrcFile(v); onChange({ sheetId: '', columnId: '', parent: null }); }}
            load={async (q) => [...(fileId && fileName ? [{ value: fileId, label: fileName, sub: 'ไฟล์นี้' }] : []), ...(await filesApi.accessible(q)).filter((f) => f.id !== fileId).map((f) => ({ value: f.id, label: f.name, sub: f.path, color: f.color }))]} />
        </Field>
        <Field label="ชีตต้นทาง">
          <Select value={lookup.sheetId} onChange={(e) => onChange({ sheetId: e.target.value, columnId: '', parent: null })}>
            <option value="">— เลือกชีต —</option>{sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="คอลัมน์ที่จะดึงมาเป็นตัวเลือก">
          <Select value={lookup.columnId} onChange={(e) => onChange({ ...lookup, columnId: e.target.value })} disabled={!lookup.sheetId}>
            <option value="">— เลือกคอลัมน์ —</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      {!hideParent && <Toggle checked={hasParent} disabled={!lookup.sheetId || !parentCandidates.length}
        onChange={(v) => onChange({ ...lookup, parent: v ? { localColumnId: parentCandidates[0]?.id ?? '', foreignColumnId: cols[0]?.id ?? '' } : null })}
        label="แสดงเฉพาะค่าที่ตรงกับคอลัมน์อื่นในแถวนี้ (ตัวเลือกขึ้นต่อกัน)" />}
      {!hideParent && !parentCandidates.length && <p className="text-xs text-muted">ตัวเลือกแบบขึ้นต่อกันใช้ได้เมื่อตารางนี้มีคอลัมน์อื่นที่บันทึกแล้ว (กรณีสร้างไฟล์ใหม่ ให้บันทึกก่อนแล้วกลับมาตั้งค่านี้)</p>}
      {!hideParent && hasParent && lookup.parent && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="คอลัมน์ในตารางนี้ (ผู้ใช้เลือกก่อน)" hint="เช่น Plant">
            <Select value={lookup.parent.localColumnId} onChange={(e) => onChange({ ...lookup, parent: { ...lookup.parent!, localColumnId: e.target.value } })}>
              {parentCandidates.map((c) => <option key={c.key} value={c.id}>{c.name || '(ไม่มีชื่อ)'}</option>)}
            </Select>
          </Field>
          <Field label="คอลัมน์ในตารางต้นทางที่ต้องตรงกัน" hint="เช่น Plant ในตาราง plant">
            <Select value={lookup.parent.foreignColumnId} onChange={(e) => onChange({ ...lookup, parent: { ...lookup.parent!, foreignColumnId: e.target.value } })}>
              {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
      <p className="text-xs text-muted">ตัวเลือกจะอัปเดตตามข้อมูลล่าสุดในตารางต้นทางเสมอ ผู้กรอกเลือกค่าได้แม้ไม่มีสิทธิ์อ่านตารางต้นทาง</p>
    </div>
  );
}
