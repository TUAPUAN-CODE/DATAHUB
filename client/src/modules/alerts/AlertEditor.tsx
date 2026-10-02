import { Plus, Trash2 } from 'lucide-react';
import { Field, Select, Toggle } from '@/components/ui/Inputs';
import type { AlertCfg, ColumnDraft } from '@/types';
import { DEFAULT_ALERT_LEVELS, DEFAULT_NORMAL_COLOR } from './level';

/**
 * Colour alert of a column: ratio = (end or NOW) − start, compared with the limit (minutes).
 * Levels are user-defined (e.g. 50 % yellow, 100 % red); below the first level the "normal" colour is used.
 */
export function AlertEditor({ c, setV, siblings }: { c: ColumnDraft; setV: (p: Record<string, unknown>) => void; siblings: ColumnDraft[] }) {
  const a = c.validation?.alert ?? null;
  const dates = siblings.filter((s) => s.id && s.key !== c.key && (s.dataType === 'datetime' || s.dataType === 'date'));
  const nums = siblings.filter((s) => s.id && s.key !== c.key && (s.dataType === 'int' || s.dataType === 'float'));
  const set = (p: Partial<AlertCfg>) => a && setV({ alert: { ...a, ...p } });
  const levels = a?.levels ?? [];
  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/[.04] p-3 md:col-span-2">
      <Toggle checked={!!a} onChange={(v) => setV({ alert: v ? { startColumnId: dates[0]?.id ?? '', endColumnId: null, limitColumnId: nums[0]?.id ?? '', normalColor: DEFAULT_NORMAL_COLOR, levels: DEFAULT_ALERT_LEVELS } : null })}
        label={<span className="font-semibold">แจ้งเตือนด้วยสีตามสัดส่วนเวลามาตรฐาน</span>} />
      {a && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="เวลาเริ่ม"><Select value={a.startColumnId} onChange={(e) => set({ startColumnId: e.target.value })}>
              <option value="">— เลือกคอลัมน์ —</option>{dates.map((s) => <option key={s.key} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="เวลาสิ้นสุด" hint="ยังว่าง = นับถึงเวลาปัจจุบัน (อัปเดตทุก 1 นาที)">
              <Select value={a.endColumnId ?? ''} onChange={(e) => set({ endColumnId: e.target.value || null })}>
                <option value="">— ใช้เวลาปัจจุบัน —</option>{dates.map((s) => <option key={s.key} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="เวลามาตรฐาน (นาที)" hint="คอลัมน์ตัวเลข เช่น สูตร HM(LOOKUP(...))">
              <Select value={a.limitColumnId} onChange={(e) => set({ limitColumnId: e.target.value })}>
                <option value="">— เลือกคอลัมน์ —</option>{nums.map((s) => <option key={s.key} value={s.id}>{s.name}</option>)}</Select></Field>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <input type="color" value={a.normalColor ?? DEFAULT_NORMAL_COLOR} onChange={(e) => set({ normalColor: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-line" />
              <span>ปกติ (ยังไม่ถึงระดับแรก)</span>
              <Toggle checked={a.normalColor !== null} onChange={(v) => set({ normalColor: v ? DEFAULT_NORMAL_COLOR : null })} label="ใช้สี" />
            </div>
            {levels.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span>เมื่อเกิน</span>
                <input type="number" min={0} value={l.atPct} onChange={(e) => set({ levels: levels.map((x, k) => (k === i ? { ...x, atPct: Number(e.target.value) } : x)) })} className="ds-input h-8 w-20 px-2" />
                <span>% ของเวลามาตรฐาน →</span>
                <input type="color" value={l.color} onChange={(e) => set({ levels: levels.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)) })} className="h-7 w-9 cursor-pointer rounded border border-line" />
                <input value={l.label ?? ''} placeholder="ชื่อระดับ" onChange={(e) => set({ levels: levels.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} className="ds-input h-8 w-36 px-2" />
                <button type="button" disabled={levels.length <= 1} onClick={() => set({ levels: levels.filter((_, k) => k !== i) })} className="rounded p-1 text-muted hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set({ levels: [...levels, { atPct: (levels[levels.length - 1]?.atPct ?? 100) + 50, color: '#7C3AED', label: '' }] })} className="flex items-center gap-1 text-xs text-primary"><Plus className="h-3.5 w-3.5" />เพิ่มระดับ</button>
          </div>
          <p className="text-[11px] text-muted">สีแสดงในตาราง, Excel และ PDF — เซลล์ที่ไม่มีเวลาเริ่มหรือเวลามาตรฐานจะไม่มีสี</p>
        </>
      )}
    </div>
  );
}
