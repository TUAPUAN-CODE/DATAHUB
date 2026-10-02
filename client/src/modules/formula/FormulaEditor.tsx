import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Field, TextArea, Toggle } from '@/components/ui/Inputs';
import { Plus, Trash2 } from 'lucide-react';
import { filesApi } from '@/api/endpoints';
import { loadCols } from '@/lib/dashCols';
import { FilePicker } from '@/components/files/FilePicker';
import { Select } from '@/components/ui/Inputs';
import type { Column, ColumnDraft, FormulaSource, Sheet } from '@/types';
import { formulaApi, FormulaCheck, FormulaFn } from './api';

/**
 * Editor of a computed column. Self-contained: it only reads / writes `validation.formula` of the draft.
 * The expression is edited with column NAMES; the server stores column ids so a rename never breaks it.
 */
export function FormulaEditor({ c, setV, siblings, sheetId }: { c: ColumnDraft; setV: (p: Record<string, unknown>) => void; siblings: ColumnDraft[]; sheetId?: string }) {
  const on = !!c.validation?.formula;
  const expr = c.validation?.formula?.expr ?? '';
  const sources: FormulaSource[] = c.validation?.formula?.sources ?? [];
  const setF = (p: { expr?: string; sources?: FormulaSource[] }) => {
    const next = { expr, sources, ...p };
    setV({ formula: next.sources?.length ? next : { expr: next.expr } });
  };
  const ref = useRef<HTMLTextAreaElement>(null);
  const [fns, setFns] = useState<FormulaFn[]>([]);
  const [check, setCheck] = useState<FormulaCheck | null>(null);
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => { if (on && !fns.length) void formulaApi.functions().then(setFns).catch(() => undefined); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  // live validation (needs a saved sheet; new columns are checked when saved)
  useEffect(() => {
    if (!on || !sheetId || !expr.trim()) { setCheck(null); return; }
    let live = true;
    const t = setTimeout(() => {
      formulaApi.validate(sheetId, { expr, dataType: c.dataType, columnId: c.id ?? null, sources: sources.map((x) => ({ alias: x.alias, sheetId: x.sheetId })) }).then((r) => live && setCheck(r)).catch(() => live && setCheck(null));
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [expr, on, sheetId, c.dataType, c.id, JSON.stringify(sources.map((x) => [x.alias, x.sheetId]))]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => [...new Set(fns.map((f) => f.group))], [fns]);
  const refCols = siblings.filter((s) => s.id && s.key !== c.key && s.name.trim());

  const insert = (text: string) => {
    const el = ref.current;
    const a = el?.selectionStart ?? expr.length;
    const b = el?.selectionEnd ?? expr.length;
    const next = expr.slice(0, a) + text + expr.slice(b);
    setF({ expr: next });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + text.length, a + text.length); });
  };
  const shown = fns.filter((f) => f.group === (group ?? groups[0]));

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[.03] p-3 md:col-span-2">
      <Toggle checked={on} onChange={(v) => setV({ formula: v ? { expr: '' } : null })}
        label={<span className="font-semibold text-primary">คำนวณค่าอัตโนมัติด้วยสูตร (ƒ)</span>} />
      {on && (
        <>
          <Field label="สูตร" hint="อ้างอิงคอลัมน์ด้วย [ชื่อคอลัมน์] เช่น IF([น้ำหนัก] > 100, &quot;หนัก&quot;, &quot;ปกติ&quot;) — ผู้ใช้แก้ค่าในคอลัมน์นี้เองไม่ได้">
            <TextArea ref={ref} rows={3} value={expr} onChange={(e) => setF({ expr: e.target.value })} className="font-mono text-[13px]" invalid={check?.valid === false} placeholder='เช่น ROUND(DATEDIFF("hour", [เข้าห้องเย็น], [ออกห้องเย็น]), 1)' />
          </Field>
          <SourcesEditor sources={sources} onChange={(next) => setF({ sources: next })} onInsert={insert} />
          {check && (check.valid
            ? <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-4 w-4" />สูตรถูกต้อง</p>
            : <p className="flex items-start gap-1.5 text-xs text-danger"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{check.message}{check.pos >= 0 && expr ? <> — ใกล้ “<span className="font-mono">{expr.slice(Math.max(0, check.pos), check.pos + 12)}</span>”</> : null}</span></p>)}
          <div>
            <p className="mb-1 text-xs font-medium text-muted">คอลัมน์ที่อ้างอิงได้ (กดเพื่อแทรก)</p>
            <div className="flex flex-wrap gap-1.5">
              {refCols.length ? refCols.map((s) => (
                <button key={s.key} type="button" onClick={() => insert(`[${s.name.replace(/\]/g, ']]')}]`)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs hover:border-primary/50 hover:text-primary">{s.name}</button>
              )) : <span className="text-xs text-muted">ยังไม่มีคอลัมน์อื่นที่บันทึกแล้ว — บันทึกคอลัมน์ก่อนจึงอ้างอิงได้</span>}
            </div>
          </div>
          {!!fns.length && (
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted">ฟังก์ชัน</span>
                {groups.map((g) => <button key={g} type="button" onClick={() => setGroup(g)} className={`rounded-full px-2.5 py-0.5 text-xs ${(group ?? groups[0]) === g ? 'bg-primary/10 text-primary' : 'text-muted hover:text-ink'}`}>{g}</button>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shown.map((f) => (
                  <button key={f.name} type="button" onClick={() => insert(`${f.name}(`)} title={`${f.signature}\n${f.description}${f.example ? `\nตัวอย่าง: ${f.example}` : ''}`}
                    className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[11px] hover:border-primary/50 hover:text-primary">{f.name}</button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">เอาเมาส์ชี้ที่ชื่อฟังก์ชันเพื่อดูวิธีใช้ · ค่าว่างในคอลัมน์ที่อ้างอิงจะทำให้ผลลัพธ์ว่าง (ยกเว้นใช้ IF / COALESCE / ISBLANK)</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Other files/sheets the formula reads: folder → sub-folder → file → sheet, then an alias used as @alias[Column] */
function SourcesEditor({ sources, onChange, onInsert }: { sources: FormulaSource[]; onChange: (s: FormulaSource[]) => void; onInsert: (t: string) => void }) {
  const update = (i: number, p: Partial<FormulaSource>) => onChange(sources.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const add = () => onChange([...sources, { alias: `ข้อมูล${sources.length + 1}`, sheetId: '' }]);
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">ดึงข้อมูลจากไฟล์อื่น (ใช้กับ LOOKUP)</p>
        <button type="button" onClick={add} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" />เพิ่มแหล่งข้อมูล</button>
      </div>
      {!sources.length && <p className="text-[11px] text-muted">เช่น ตารางเวลามาตรฐานของวัตถุดิบ: LOOKUP(@เกณฑ์[เตรียม→เย็น], @เกณฑ์[ประเภท], [ประเภท]) — ผู้ใช้ที่ไม่มีสิทธิ์เปิดไฟล์ต้นทางยังเห็นผลลัพธ์ในตารางนี้ได้</p>}
      {sources.map((s, i) => <SourceRow key={i} s={s} onChange={(p) => update(i, p)} onRemove={() => onChange(sources.filter((_, k) => k !== i))} onInsert={onInsert} />)}
    </div>
  );
}

function SourceRow({ s, onChange, onRemove, onInsert }: { s: FormulaSource; onChange: (p: Partial<FormulaSource>) => void; onRemove: () => void; onInsert: (t: string) => void }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [cols, setCols] = useState<Column[]>([]);
  const fileId = s.fileId ?? null;
  useEffect(() => {
    if (!fileId) { setSheets([]); return; }
    let live = true;
    filesApi.get(fileId).then((r) => live && setSheets(r.sheets)).catch(() => live && setSheets([]));
    return () => { live = false; };
  }, [fileId]);
  useEffect(() => {
    let live = true;
    if (s.sheetId) void loadCols(s.sheetId).then((x) => live && setCols(x.filter((k) => !k.isDeleted))).catch(() => live && setCols([]));
    else setCols([]);
    return () => { live = false; };
  }, [s.sheetId]);
  const picked = fileId ? { id: fileId, name: s.fileName ?? 'ไฟล์', path: '' } : null;
  return (
    <div className="space-y-1.5 rounded-lg bg-primary/[.04] p-2">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_9rem_auto]">
        <FilePicker value={picked} placeholder="เลือกไฟล์ต้นทาง" onChange={(f) => onChange({ fileId: f.id, fileName: f.name, sheetId: '', sheetName: null })} />
        <Select value={s.sheetId} onChange={(e) => onChange({ sheetId: e.target.value, sheetName: sheets.find((x) => x.id === e.target.value)?.name ?? null })} disabled={!fileId}>
          <option value="">{s.sheetId && s.sheetName ? s.sheetName : '— เลือกชีต —'}</option>
          {sheets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <input value={s.alias} onChange={(e) => onChange({ alias: e.target.value.replace(/[^\p{L}\p{N}\p{M}_]/gu, '') })} className="ds-input h-10 px-2 font-mono text-sm" title="ชื่อเรียกใช้ในสูตร" placeholder="ชื่อเรียก" />
        <button type="button" onClick={onRemove} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" title="ลบ"><Trash2 className="h-4 w-4" /></button>
      </div>
      {!!cols.length && s.alias && (
        <div className="flex flex-wrap gap-1.5">
          {cols.map((k) => <button key={k.id} type="button" onClick={() => onInsert(`@${s.alias}[${k.name.replace(/\]/g, ']]')}]`)} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] hover:border-primary/50 hover:text-primary">@{s.alias}[{k.name}]</button>)}
        </div>
      )}
    </div>
  );
}
