import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { get, post } from '@/api/client';
import { toast } from '@/store/ui';
import { Field, Select, Toggle } from '@/components/ui/Inputs';
import type { AlertCfg, ColumnDraft } from '@/types';
import { DEFAULT_ALERT_LEVELS, DEFAULT_NORMAL_COLOR } from './level';

/**
 * Colour alert of a column: ratio = (end or NOW) − start, compared with the limit (minutes).
 * Levels are user-defined (e.g. 50 % yellow, 100 % red); below the first level the "normal" colour is used.
 */
export function AlertEditor({ c, setV, siblings, sheetId }: { c: ColumnDraft; setV: (p: Record<string, unknown>) => void; siblings: ColumnDraft[]; sheetId?: string }) {
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
          <LineNotify a={a} set={set} siblings={siblings} selfKey={c.key} sheetId={sheetId} />
          <p className="text-[11px] text-muted">สีแสดงในตาราง, Excel และ PDF — เซลล์ที่ไม่มีเวลาเริ่มหรือเวลามาตรฐานจะไม่มีสี</p>
        </>
      )}
    </div>
  );
}

interface LineTarget { id: string; kind: string; label: string | null }

/** LINE message when a row reaches a level (the server checks every minute, even when nobody has the page open) */
function LineNotify({ a, set, siblings, selfKey, sheetId }: { a: AlertCfg; set: (p: Partial<AlertCfg>) => void; siblings: ColumnDraft[]; selfKey: string; sheetId?: string }) {
  const [targets, setTargets] = useState<LineTarget[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = a.notify ?? null;
  useEffect(() => {
    if (!sheetId) return;
    void get<{ enabled: boolean; targets: LineTarget[] }>(`/sheets/${sheetId}/line/targets`).then((r) => { setTargets(r.targets); setEnabled(r.enabled); }).catch(() => undefined);
  }, [sheetId]);
  const sorted = [...a.levels].sort((x, y) => x.atPct - y.atPct);
  const labelCols = siblings.filter((s) => s.id && s.key !== selfKey && s.name.trim());
  const patch = (p: Partial<NonNullable<AlertCfg['notify']>>) => n && set({ notify: { ...n, ...p } });
  const test = async () => {
    if (!sheetId || !n?.targetId) return;
    setBusy(true);
    try { await post(`/sheets/${sheetId}/line/test`, { targetId: n.targetId }); toast.success('ส่งข้อความทดสอบแล้ว'); } catch (e) { toast.error(e, 'ส่ง LINE ไม่สำเร็จ'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-2.5">
      <Toggle checked={!!n} onChange={(v) => set({ notify: v ? { targetId: targets[0]?.id ?? '', levelIdx: null, labelColumnIds: [] } : null })} label={<span className="font-medium">ส่งแจ้งเตือนทาง LINE เมื่อถึงระดับ</span>} />
      {n && (
        <>
          {!enabled && <p className="text-xs text-danger">เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ตั้งค่าแล้วจึงจะส่งได้</p>}
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Field label="ผู้รับ / กลุ่ม LINE" hint="เชิญบอทเข้ากลุ่มแล้วพิมพ์ “id” (หรือส่งข้อความหาบอท) กลุ่ม/ผู้ใช้จะปรากฏในรายการนี้ — หรือวาง ID เอง">
              <input list="line-targets" value={n.targetId} onChange={(e) => patch({ targetId: e.target.value.trim() })} className="ds-input h-10 w-full px-2 font-mono text-sm" placeholder="Cxxxxxxxx… / Uxxxxxxxx…" />
              <datalist id="line-targets">{targets.map((t) => <option key={t.id} value={t.id}>{t.label ?? t.kind}</option>)}</datalist>
            </Field>
            <button type="button" disabled={busy || !n.targetId || !sheetId} onClick={() => void test()} className="mt-6 h-10 rounded-lg border border-line px-3 text-sm hover:border-primary/50 disabled:opacity-40">ส่งทดสอบ</button>
          </div>
          <div className="text-sm">
            <p className="mb-1 text-xs font-medium text-muted">แจ้งเมื่อถึงระดับ (ไม่เลือกเลย = ทุกระดับ · แจ้งครั้งเดียวต่อแถวต่อระดับ)</p>
            <div className="flex flex-wrap gap-3">
              {sorted.map((l, i) => (
                <label key={i} className="flex items-center gap-1.5"><input type="checkbox" checked={!!n.levelIdx?.includes(i)}
                  onChange={(e) => patch({ levelIdx: e.target.checked ? [...(n.levelIdx ?? []), i] : (n.levelIdx ?? []).filter((x) => x !== i) })} />
                  <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />{l.label || `เกิน ${l.atPct}%`}</label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">คอลัมน์ที่ใส่ในข้อความ (สูงสุด 4 เช่น รหัสวัตถุดิบ)</p>
            <div className="flex flex-wrap gap-1.5">
              {labelCols.map((s) => {
                const on = !!n.labelColumnIds?.includes(s.id!);
                return <button key={s.key} type="button" onClick={() => patch({ labelColumnIds: on ? (n.labelColumnIds ?? []).filter((x) => x !== s.id) : [...(n.labelColumnIds ?? []), s.id!].slice(0, 4) })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : 'border-line hover:border-primary/50'}`}>{s.name}</button>;
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted">แจ้งเฉพาะแถวที่ยังไม่มีเวลาสิ้นสุด และเริ่มภายใน 7 วัน (ตั้งได้ที่ LINE_ALERT_WINDOW_DAYS)</p>
        </>
      )}
    </div>
  );
}
