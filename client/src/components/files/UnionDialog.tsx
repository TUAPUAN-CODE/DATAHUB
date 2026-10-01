import { useEffect, useState } from 'react';
import { Layers, Plus, X } from 'lucide-react';
import { apiError } from '@/api/client';
import { filesApi, unionApi } from '@/api/endpoints';
import { toast } from '@/store/ui';
import type { Sheet } from '@/types';
import { Button } from '../ui/Button';
import { Field, Select, TextInput } from '../ui/Inputs';
import { Modal } from '../ui/Modal';
import { SearchSelect } from '../ui/SearchSelect';

interface Src { sheetId: string; label: string }

/**
 * Pick the sheets (from any files you can read) whose rows are gathered into one sheet.
 * All sources must have exactly the same columns – the server checks and lists every difference.
 */
export function UnionDialog({ open, onClose, mode, folderId, fileId, sheetId, initialSources, onDone }: {
  open: boolean; onClose: () => void; mode: 'file' | 'sheet' | 'edit'; folderId?: string; fileId?: string; sheetId?: string;
  initialSources?: Src[]; onDone: (r: { fileId?: string; sheetId?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [sources, setSources] = useState<Src[]>([]);
  const [pickFile, setPickFile] = useState<{ id: string; name: string } | null>(null);
  const [fileSheets, setFileSheets] = useState<Sheet[]>([]);
  const [pickSheet, setPickSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; problems?: { source: string; differences: string[] }[] } | null>(null);

  useEffect(() => { if (open) { setName(mode === 'file' ? 'ไฟล์รวมข้อมูล' : 'รวมข้อมูล'); setSources(initialSources ?? []); setPickFile(null); setFileSheets([]); setPickSheet(''); setErr(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pickFile) { setFileSheets([]); return; }
    let live = true;
    filesApi.get(pickFile.id).then((r) => { if (!live) return; const list = r.sheets.filter((s) => !s.isUnion); setFileSheets(list); setPickSheet(list[0]?.id ?? ''); }).catch(() => live && setFileSheets([]));
    return () => { live = false; };
  }, [pickFile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    const s = fileSheets.find((x) => x.id === pickSheet);
    if (!s || !pickFile || sources.some((x) => x.sheetId === s.id)) return;
    setSources([...sources, { sheetId: s.id, label: `${pickFile.name} / ${s.name}` }]);
  };
  // add every sheet of the file in one click
  const addAll = () => {
    if (!pickFile) return;
    const extra = fileSheets.filter((s) => !sources.some((x) => x.sheetId === s.id)).map((s) => ({ sheetId: s.id, label: `${pickFile.name} / ${s.name}` }));
    setSources([...sources, ...extra]);
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    const ids = sources.map((s) => s.sheetId);
    try {
      if (mode === 'file') { const r = await unionApi.createFile({ name: name.trim(), folderId: folderId!, sources: ids }); toast.success('สร้างไฟล์รวมข้อมูลแล้ว'); onDone({ fileId: r.id, sheetId: r.sheetId }); }
      else if (mode === 'sheet') { const r = await unionApi.addSheet(fileId!, { name: name.trim(), sources: ids }); toast.success('เพิ่มชีตรวมข้อมูลแล้ว'); onDone({ sheetId: r.id }); }
      else { await unionApi.setSources(sheetId!, ids); toast.success('บันทึกแหล่งข้อมูลแล้ว'); onDone({ sheetId }); }
      onClose();
    } catch (e) { const i = apiError(e); setErr({ message: i.message, problems: i.details?.problems }); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Layers className="h-5 w-5" />}
      title={mode === 'file' ? 'สร้างไฟล์รวมข้อมูลจากไฟล์อื่น' : mode === 'sheet' ? 'เพิ่มชีตรวมข้อมูล' : 'จัดการแหล่งข้อมูลที่รวม'}
      description="ดึงแถวจากหลายชีต/หลายไฟล์มารวมในที่เดียว โดยทุกชีตต้องมีคอลัมน์เหมือนกันทุกอย่าง (ชื่อ ชนิด บังคับกรอก ตัวเลือก กฎตรวจสอบ)"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button onClick={submit} loading={busy} disabled={!sources.length || (mode !== 'edit' && !name.trim())}>{mode === 'edit' ? 'บันทึกและซิงค์' : 'สร้าง'}</Button></>}>
      <div className="space-y-4">
        {mode !== 'edit' && <Field label={mode === 'file' ? 'ชื่อไฟล์' : 'ชื่อชีต'} required><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <div>
          <p className="mb-1.5 text-[13px] font-medium">ชีตต้นทางที่จะรวม ({sources.length})</p>
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.sheetId} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <button onClick={() => setSources(sources.filter((x) => x.sheetId !== s.sheetId))} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" aria-label="เอาออก"><X className="h-4 w-4" /></button>
              </div>
            ))}
            {!sources.length && <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">ยังไม่ได้เลือกชีต — เลือกไฟล์ด้านล่างแล้วกด “เพิ่ม”</p>}
          </div>
        </div>
        <div className="rounded-xl bg-ink/[.03] p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <SearchSelect value={pickFile?.id ?? null} placeholder="เลือกไฟล์ต้นทาง" onChange={(v, o) => setPickFile({ id: v, name: o.label })}
              load={async (q) => (await filesApi.accessible(q)).filter((f) => f.id !== fileId).map((f) => ({ value: f.id, label: f.name, sub: f.path, color: f.color }))} />
            <Select value={pickSheet} onChange={(e) => setPickSheet(e.target.value)} disabled={!fileSheets.length}>
              {!fileSheets.length && <option value="">— เลือกไฟล์ก่อน —</option>}
              {fileSheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button icon={<Plus className="h-4 w-4" />} onClick={add} disabled={!pickSheet}>เพิ่ม</Button>
          </div>
          {fileSheets.length > 1 && <button onClick={addAll} className="mt-2 text-xs text-primary hover:underline">เพิ่มทุกชีตของไฟล์นี้</button>}
        </div>
        {err && (
          <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
            <p className="font-medium">{err.problems?.length ? 'โครงสร้างคอลัมน์ไม่เหมือนกัน' : err.message}</p>
            {err.problems?.map((p) => (
              <div key={p.source} className="mt-2"><p className="font-medium">{p.source}</p><ul className="ml-4 list-disc text-[13px]">{p.differences.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}{p.differences.length > 8 && <li>… อีก {p.differences.length - 8} รายการ</li>}</ul></div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">แถวจะถูกดึงมาอัตโนมัติและอัปเดตตามต้นทาง ชีตรวมเป็นแบบอ่านอย่างเดียว (แก้ข้อมูลที่ไฟล์ต้นทาง) และมีคอลัมน์ “แหล่งที่มา” บอกว่าแถวมาจากไฟล์/ชีตไหน ผู้เปิดชีตรวมจะเห็นข้อมูลของทุกแหล่งที่รวมไว้</p>
      </div>
    </Modal>
  );
}

