import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { apiError } from '@/api/client';
import { ImportResult, rowsApi } from '@/api/endpoints';
import { cn } from '@/lib/cn';
import { downloadXlsx } from '@/lib/csv';
import { normHeader, ParsedSheet, parseTableFile } from '@/lib/importFile';
import { TYPE_META } from '@/lib/columnTypes';
import type { Column } from '@/types';
import { Button } from '../ui/Button';
import { Select, Toggle } from '../ui/Inputs';
import { Modal } from '../ui/Modal';

const BATCH = 200;
type Stage = 'pick' | 'map' | 'check' | 'run' | 'done';

/** Import rows from an Excel / CSV file whose columns match this table */
export function ImportModal({ open, onClose, sheetId, sheetName, fileName, columns, onDone }: {
  open: boolean; onClose: () => void; sheetId: string; sheetName: string; fileName: string; columns: Column[]; onDone: () => void;
}) {
  const [stage, setStage] = useState<Stage>('pick');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [wsIdx, setWsIdx] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState<Record<string, number>>({}); // column id -> file column index (-1 = skip)
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<{ valid: number; invalid: number; skippedEmpty: number; errors: ImportResult['errors'] } | null>(null);
  const [inserted, setInserted] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const importable = useMemo(() => columns.filter((c) => c.dataType !== 'image'), [columns]);
  const ws = sheets[wsIdx];
  const header = ws?.rows[0] ?? [];
  const dataRows = useMemo(() => (ws ? ws.rows.slice(hasHeader ? 1 : 0) : []), [ws, hasHeader]);
  const width = useMemo(() => Math.max(0, ...(ws?.rows.slice(0, 50).map((r) => r.length) ?? [0])), [ws]);

  const reset = () => { setStage('pick'); setErr(null); setSheets([]); setWsIdx(0); setMap({}); setReport(null); setInserted(0); setProgress({ done: 0, total: 0 }); };
  const close = () => { if (busy) return; if (stage === 'done') onDone(); reset(); onClose(); };

  const autoMap = (sh: ParsedSheet, header: boolean) => {
    const m: Record<string, number> = {};
    const heads = (sh.rows[0] ?? []).map(normHeader);
    importable.forEach((c, i) => {
      const idx = header ? heads.indexOf(normHeader(c.name)) : i < (sh.rows[0]?.length ?? 0) ? i : -1; // no header row: by position
      m[c.id] = idx;
    });
    return m;
  };

  const load = async (file?: File | null) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const parsed = (await parseTableFile(file)).filter((s) => s.rows.some((r) => r.some((v) => String(v ?? '').trim() !== '')));
      if (!parsed.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      setSheets(parsed); setWsIdx(0); setHasHeader(true); setMap(autoMap(parsed[0], true)); setStage('map');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const mappedCount = Object.values(map).filter((i) => i >= 0).length;
  const buildRows = () => dataRows.map((r, i) => {
    const values: Record<string, unknown> = {};
    for (const c of importable) { const idx = map[c.id]; if (idx !== undefined && idx >= 0) values[c.id] = r[idx] ?? ''; }
    return { rowNo: i + 1 + (hasHeader ? 1 : 0), values };
  });

  const run = async (dryRun: boolean, skipInvalid: boolean) => {
    const rows = buildRows();
    if (!rows.length) { setErr('ไม่มีแถวข้อมูลให้นำเข้า'); return; }
    setBusy(true); setErr(null); setStage(dryRun ? 'check' : 'run'); setProgress({ done: 0, total: rows.length });
    const agg = { valid: 0, invalid: 0, skippedEmpty: 0, errors: [] as ImportResult['errors'] };
    let ins = 0;
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const r = await rowsApi.importRows(sheetId, { rows: rows.slice(i, i + BATCH), dryRun, skipInvalid });
        agg.valid += r.valid; agg.invalid += r.invalid; agg.skippedEmpty += r.skippedEmpty; agg.errors.push(...r.errors); ins += r.inserted;
        setProgress({ done: Math.min(rows.length, i + BATCH), total: rows.length });
      }
      setReport(agg);
      if (dryRun) { setStage('check'); }
      else { setInserted(ins); setStage('done'); onDone(); }
    } catch (e) {
      setErr(apiError(e).message);
      setStage(dryRun ? 'map' : 'check');
      if (!dryRun && ins) onDone();
    } finally { setBusy(false); }
  };

  const titles: Record<Stage, string> = { pick: 'นำเข้าข้อมูลจากไฟล์', map: 'จับคู่คอลัมน์', check: 'ตรวจสอบข้อมูล', run: 'กำลังนำเข้า…', done: 'นำเข้าเสร็จแล้ว' };
  return (
    <Modal open={open} onClose={close} size="xl" icon={<FileSpreadsheet className="h-5 w-5" />} title={titles[stage]}
      description={`เพิ่มแถวใหม่ต่อท้ายชีต “${sheetName}” — ข้อมูลเดิมไม่ถูกแก้ไข`}
      footer={
        stage === 'pick' ? <Button variant="secondary" onClick={close}>ปิด</Button>
        : stage === 'map' ? <><Button variant="secondary" onClick={reset}>เลือกไฟล์ใหม่</Button><Button onClick={() => void run(true, false)} loading={busy} disabled={!mappedCount || !dataRows.length}>ตรวจสอบข้อมูล ({dataRows.length.toLocaleString()} แถว)</Button></>
        : stage === 'check' && report ? <>
            <Button variant="secondary" onClick={() => setStage('map')}>กลับไปแก้การจับคู่</Button>
            <Button onClick={() => void run(false, true)} loading={busy} disabled={!report.valid}>{report.invalid ? `นำเข้าเฉพาะ ${report.valid.toLocaleString()} แถวที่ถูกต้อง` : `นำเข้า ${report.valid.toLocaleString()} แถว`}</Button>
          </>
        : stage === 'done' ? <Button onClick={close}>เสร็จสิ้น</Button> : null
      }>
      {err && <p className="mb-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}

      {stage === 'pick' && (
        <div className="space-y-4">
          <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void load(e.dataTransfer.files[0]); }}
            onClick={() => input.current?.click()}
            className={cn('grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors', over ? 'border-primary bg-primary/5' : 'border-line hover:border-primary/50')}>
            <div>
              <Upload className="mx-auto h-9 w-9 text-primary" />
              <p className="mt-3 font-medium">{busy ? 'กำลังอ่านไฟล์…' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์'}</p>
              <p className="mt-1 text-sm text-muted">รองรับ Excel (.xlsx) และ CSV (.csv) — แถวแรกควรเป็นชื่อคอลัมน์เหมือนในตารางนี้</p>
            </div>
            <input ref={input} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-ink/[.03] px-4 py-3 text-sm">
            <span className="flex-1 text-muted">ยังไม่มีไฟล์? ดาวน์โหลดไฟล์ตัวอย่างที่มีหัวคอลัมน์ตรงกับตารางนี้ แล้วกรอกข้อมูลตามนั้น</span>
            <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void downloadXlsx(`${fileName} - ${sheetName} (แม่แบบนำเข้า)`, sheetName, importable, [])}>ดาวน์โหลดแม่แบบ</Button>
          </div>
        </div>
      )}

      {stage === 'map' && ws && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            {sheets.length > 1 && (
              <label className="flex items-center gap-2 text-sm">ชีตในไฟล์:
                <Select value={wsIdx} onChange={(e) => { const i = Number(e.target.value); setWsIdx(i); setMap(autoMap(sheets[i], hasHeader)); }} className="w-48">
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </Select>
              </label>
            )}
            <Toggle checked={hasHeader} onChange={(v) => { setHasHeader(v); setMap(autoMap(ws, v)); }} label="แถวแรกเป็นชื่อคอลัมน์" />
            <span className="ml-auto text-sm text-muted">พบ {dataRows.length.toLocaleString()} แถวข้อมูล · จับคู่แล้ว {mappedCount}/{importable.length} คอลัมน์</span>
          </div>
          <div className="max-h-[48vh] overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr><th className="px-3 py-2">คอลัมน์ในตาราง</th><th className="px-3 py-2">ดึงจากคอลัมน์ในไฟล์</th><th className="px-3 py-2">ตัวอย่างข้อมูล</th></tr></thead>
              <tbody>
                {importable.map((c) => {
                  const idx = map[c.id] ?? -1;
                  return (
                    <tr key={c.id} className="border-t border-line">
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{TYPE_META[c.dataType].icon}</span>{c.name}{c.isRequired && <span className="text-danger">*</span>}</span></td>
                      <td className="px-3 py-2">
                        <Select value={idx} onChange={(e) => setMap({ ...map, [c.id]: Number(e.target.value) })} className="w-56 [&>select]:!h-8 [&>select]:text-xs">
                          <option value={-1}>— ไม่นำเข้า —</option>
                          {Array.from({ length: width }).map((_, i) => <option key={i} value={i}>{hasHeader ? String(header[i] ?? '').trim() || `คอลัมน์ ${i + 1}` : `คอลัมน์ ${i + 1}`}</option>)}
                        </Select>
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2 text-xs text-muted">{idx >= 0 ? dataRows.slice(0, 3).map((r) => String(r[idx] ?? '')).filter(Boolean).join(' · ') || '(ว่าง)' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {columns.some((c) => c.dataType === 'image') && <p className="text-xs text-muted">คอลัมน์รูปภาพนำเข้าจากไฟล์ไม่ได้ ให้แนบรูปในตารางหลังนำเข้า</p>}
          {importable.some((c) => c.isRequired && (map[c.id] ?? -1) < 0 && c.defaultValue == null) && <p className="text-xs text-warning">มีคอลัมน์ที่ “บังคับกรอก” ยังไม่ได้จับคู่ — ทุกแถวจะไม่ผ่านการตรวจสอบ</p>}
        </div>
      )}

      {(stage === 'check' || stage === 'run') && (
        <div className="space-y-4">
          {busy && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
              <p className="mt-2 text-sm text-muted">{stage === 'check' ? 'กำลังตรวจสอบ' : 'กำลังนำเข้า'} {progress.done.toLocaleString()} / {progress.total.toLocaleString()} แถว</p>
            </div>
          )}
          {!busy && report && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-success/10 p-4"><p className="text-2xl font-semibold text-success">{report.valid.toLocaleString()}</p><p className="text-sm">แถวที่ถูกต้อง</p></div>
                <div className={cn('rounded-xl p-4', report.invalid ? 'bg-danger/10' : 'bg-ink/5')}><p className={cn('text-2xl font-semibold', report.invalid && 'text-danger')}>{report.invalid.toLocaleString()}</p><p className="text-sm">แถวที่มีปัญหา (จะถูกข้าม)</p></div>
                <div className="rounded-xl bg-ink/5 p-4"><p className="text-2xl font-semibold">{report.skippedEmpty.toLocaleString()}</p><p className="text-sm">แถวว่าง (ข้ามอัตโนมัติ)</p></div>
              </div>
              {report.errors.length > 0 && (
                <div className="max-h-[36vh] overflow-auto rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr><th className="px-3 py-2">แถวในไฟล์</th><th className="px-3 py-2">คอลัมน์</th><th className="px-3 py-2">ปัญหา</th></tr></thead>
                    <tbody>{report.errors.slice(0, 100).map((e, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-1.5 tabular-nums">{e.rowNo}</td><td className="px-3 py-1.5">{e.columnName}</td><td className="px-3 py-1.5 text-danger">{e.message}</td></tr>)}</tbody>
                  </table>
                  {report.errors.length > 100 && <p className="border-t border-line px-3 py-2 text-xs text-muted">แสดง 100 รายการแรก — แก้ไฟล์แล้วนำเข้าใหม่ หรือนำเข้าเฉพาะแถวที่ถูกต้องก็ได้</p>}
                </div>
              )}
              {!report.invalid && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />ข้อมูลทุกแถวผ่านการตรวจสอบ พร้อมนำเข้า</p>}
            </>
          )}
        </div>
      )}

      {stage === 'done' && (
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <p className="mt-3 text-lg font-semibold">นำเข้า {inserted.toLocaleString()} แถวเรียบร้อย</p>
          {report && report.invalid > 0 && <p className="mt-1 text-sm text-muted">ข้ามแถวที่มีปัญหา {report.invalid.toLocaleString()} แถว</p>}
          <p className="mt-1 text-sm text-muted">ดูประวัติการนำเข้าได้ที่ “ประวัติการแก้ไขของไฟล์”</p>
        </div>
      )}
    </Modal>
  );
}
