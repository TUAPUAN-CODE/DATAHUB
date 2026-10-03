import { ReactNode, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Widget } from '@/types';
import { Button } from '../ui/Button';
import { Field, Segmented, Select, TextInput, Toggle } from '../ui/Inputs';
import { ColorInput } from '../ui/misc';
import { PALETTE, RefLine, SeriesOverride } from './ChartBody';

/** Collapsible group, like the Power BI "Format" pane */
export function Group({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold">
        <span className="flex-1">{title}</span><ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 border-t border-line p-3">{children}</div>}
    </div>
  );
}

function N({ label, value, onChange, min, max, step, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return (
    <Field label={label}>
      <TextInput inputMode="decimal" step={step} placeholder={placeholder} value={value ?? ''} className="!h-9"
        onChange={(e) => { const v = e.target.value === '' ? undefined : Number(e.target.value); onChange(v === undefined || Number.isNaN(v) ? undefined : Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); }} />
    </Field>
  );
}

type Props = { w: Widget; set: (p: Partial<Widget>) => void };

export function ChartFormat({ w, set }: Props) {
  const c = w.config;
  const setC = (p: Record<string, unknown>) => set({ config: { ...c, ...p } });
  const t = w.type;
  const cartesian = ['bar', 'line', 'area', 'pct', 'pareto', 'histogram', 'xchart', 'xbar'].includes(t);
  const round = t === 'pie' || t === 'doughnut';
  const seriesCount = Math.min(8, Math.max(1, w.dataSource?.series.length ?? 1, round || w.dataSource?.groupByColumnId ? 8 : 1));
  return (
    <div className="space-y-2">
      <Group title="สีและชุดข้อมูล" open>
        {t !== 'heatmap' ? (
          <div className="space-y-1.5">
            {Array.from({ length: seriesCount }).map((_, i) => (
              <div key={i} className="flex items-center gap-2"><span className="w-5 text-xs text-muted">{i + 1}</span>
                <ColorInput value={(c.colors ?? PALETTE)[i]} swatches={PALETTE.slice(0, 7)} onChange={(v) => { const arr = [...(c.colors ?? PALETTE)]; arr[i] = v ?? PALETTE[i]; setC({ colors: arr }); }} /></div>
            ))}
            {t === 'bar' && seriesCount === 1 && <Toggle checked={!!c.colorByCategory} onChange={(v) => setC({ colorByCategory: v })} label="สีต่างกันตามหมวด" />}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="สีค่าต่ำ"><ColorInput value={c.colorLow ?? '#E8F0FE'} onChange={(v) => setC({ colorLow: v ?? '#E8F0FE' })} /></Field>
            <Field label="สีค่าสูง"><ColorInput value={c.colorHigh ?? '#1552F0'} onChange={(v) => setC({ colorHigh: v ?? '#1552F0' })} /></Field>
            <N label="ค่าต่ำสุด (ว่าง=อัตโนมัติ)" value={c.heatMin} onChange={(v) => setC({ heatMin: v })} />
            <N label="ค่าสูงสุด (ว่าง=อัตโนมัติ)" value={c.heatMax} onChange={(v) => setC({ heatMax: v })} />
            <div className="col-span-2"><Toggle checked={c.showValues !== false} onChange={(v) => setC({ showValues: v })} label="แสดงตัวเลขในช่อง" /></div>
          </div>
        )}
        {t === 'pareto' && <Field label="สีเส้นสะสม %"><ColorInput value={c.cumColor ?? '#E5484D'} onChange={(v) => setC({ cumColor: v ?? '#E5484D' })} /></Field>}
      </Group>

      {cartesian && (
        <>
          <Group title="แกน X">
            <Toggle checked={c.showX !== false} onChange={(v) => setC({ showX: v })} label="แสดงแกน X" />
            <TextInput value={c.xTitle ?? ''} onChange={(e) => setC({ xTitle: e.target.value })} placeholder="ชื่อแกน X" className="!h-9" />
            <div className="grid grid-cols-2 gap-2">
              <N label="ขนาดตัวอักษร" value={c.xFontSize} onChange={(v) => setC({ xFontSize: v })} min={8} max={24} placeholder="11" />
              {!c.horizontal && <N label="เอียงป้าย (องศา)" value={c.xAngle ?? 0} onChange={(v) => setC({ xAngle: v ?? 0 })} min={-90} max={0} />}
            </div>
          </Group>
          <Group title="แกน Y">
            <Toggle checked={c.showY !== false} onChange={(v) => setC({ showY: v })} label="แสดงแกน Y" />
            <TextInput value={c.yTitle ?? ''} onChange={(e) => setC({ yTitle: e.target.value })} placeholder="ชื่อแกน Y" className="!h-9" />
            {(t === 'pareto' || (c.seriesOverrides as SeriesOverride[] | undefined)?.some((o) => o?.axis === 'right')) && <TextInput value={c.y2Title ?? ''} onChange={(e) => setC({ y2Title: e.target.value })} placeholder="ชื่อแกน Y ขวา" className="!h-9" />}
            <div className="grid grid-cols-2 gap-2">
              <N label="ค่าต่ำสุด" value={c.yMin} onChange={(v) => setC({ yMin: v })} placeholder="อัตโนมัติ" />
              <N label="ค่าสูงสุด" value={c.yMax} onChange={(v) => setC({ yMax: v })} placeholder="อัตโนมัติ" />
              <N label="ขนาดตัวอักษร" value={c.yFontSize} onChange={(v) => setC({ yFontSize: v })} min={8} max={24} placeholder="11" />
              <div className="flex items-end pb-2"><Toggle checked={!!c.yLog} onChange={(v) => setC({ yLog: v })} label="สเกล Log" /></div>
            </div>
          </Group>
        </>
      )}

      <Group title="ป้ายค่า (Data labels)">
        <Toggle checked={!!c.labels} onChange={(v) => setC({ labels: v })} label="แสดงป้ายค่า" />
        {c.labels && (
          <>
            {round && (
              <Field label="รูปแบบ"><Segmented size="sm" value={c.labelMode ?? 'percent'} onChange={(v) => setC({ labelMode: v })} options={[{ value: 'percent', label: '%' }, { value: 'value', label: 'ค่า' }, { value: 'both', label: 'ทั้งคู่' }]} /></Field>
            )}
            {cartesian && (
              <Field label="ตำแหน่ง">
                <Select value={c.labelPos ?? 'auto'} onChange={(e) => setC({ labelPos: e.target.value === 'auto' ? undefined : e.target.value })}>
                  <option value="auto">อัตโนมัติ</option><option value="top">ด้านบน</option><option value="inside">ด้านใน</option><option value="insideTop">ในแท่ง-บน</option><option value="center">กึ่งกลาง</option><option value="bottom">ด้านล่าง</option>
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <N label="ขนาดตัวอักษร" value={c.labelSize} onChange={(v) => setC({ labelSize: v })} min={8} max={28} placeholder="10" />
              <Field label="สีตัวอักษร"><ColorInput value={c.labelColor} onChange={(v) => setC({ labelColor: v ?? '' })} allowEmpty /></Field>
              <N label="ทศนิยมของป้าย" value={c.labelDecimals} onChange={(v) => setC({ labelDecimals: v })} min={0} max={6} />
            </div>
          </>
        )}
      </Group>

      <Group title="คำอธิบาย (Legend)">
        <Toggle checked={c.legend !== false} onChange={(v) => setC({ legend: v })} label="แสดงคำอธิบาย" />
        {c.legend !== false && (
          <Field label="ตำแหน่ง"><Segmented size="sm" value={c.legendPos ?? 'bottom'} onChange={(v) => setC({ legendPos: v })} options={[{ value: 'top', label: 'บน' }, { value: 'bottom', label: 'ล่าง' }, { value: 'left', label: 'ซ้าย' }, { value: 'right', label: 'ขวา' }]} /></Field>
        )}
      </Group>

      {cartesian && (
        <Group title="เส้นตาราง">
          <Toggle checked={c.grid !== false} onChange={(v) => setC({ grid: v })} label="เส้นตารางแนวนอน" />
          <Toggle checked={!!c.gridV} onChange={(v) => setC({ gridV: v })} label="เส้นตารางแนวตั้ง" />
          <Field label="สีเส้น"><ColorInput value={c.gridColor} onChange={(v) => setC({ gridColor: v ?? '' })} allowEmpty /></Field>
        </Group>
      )}

      {['bar', 'pct', 'histogram', 'pareto'].includes(t) && (
        <Group title="แท่ง">
          <div className="grid grid-cols-2 gap-2">
            <N label="ช่องว่างระหว่างหมวด (%)" value={c.barGap ?? (t === 'histogram' ? 1 : 22)} onChange={(v) => setC({ barGap: v })} min={0} max={80} />
            <N label="ความโค้งมุมแท่ง" value={c.barRadius ?? (t === 'histogram' ? 0 : 6)} onChange={(v) => setC({ barRadius: v })} min={0} max={20} />
            <N label="ความกว้างสูงสุด" value={c.barMaxSize} onChange={(v) => setC({ barMaxSize: v })} min={4} max={300} placeholder="56" />
          </div>
          {t === 'bar' && (
            <div className="grid grid-cols-2 gap-2">
              <Toggle checked={!!c.stacked} onChange={(v) => setC({ stacked: v })} label="ซ้อนกัน" />
              <Toggle checked={!!c.horizontal} onChange={(v) => setC({ horizontal: v })} label="แนวนอน" />
            </div>
          )}
          <Toggle checked={!!c.barBorder} onChange={(v) => setC({ barBorder: v })} label="เส้นขอบแท่ง" />
        </Group>
      )}

      {['line', 'area', 'xchart', 'xbar'].includes(t) && (
        <Group title="เส้น / พื้นที่">
          {t !== 'xchart' && t !== 'xbar' && <Field label="รูปแบบเส้น"><Segmented size="sm" value={c.curve ?? 'monotone'} onChange={(v) => setC({ curve: v })} options={[{ value: 'monotone', label: 'โค้ง' }, { value: 'linear', label: 'ตรง' }, { value: 'step', label: 'ขั้นบันได' }]} /></Field>}
          <div className="grid grid-cols-2 gap-2">
            <N label="ความหนาเส้น" value={c.lineWidth ?? 2.5} onChange={(v) => setC({ lineWidth: v })} min={0.5} max={10} step={0.5} />
            {t === 'area' && <N label="ความเข้มพื้นที่ (0-1)" value={c.areaOpacity ?? 0.22} onChange={(v) => setC({ areaOpacity: v })} min={0} max={1} step={0.05} />}
          </div>
          {t !== 'xchart' && t !== 'xbar' && <Toggle checked={c.dots ?? true} onChange={(v) => setC({ dots: v })} label="แสดงจุดข้อมูล" />}
          {t === 'area' && <Toggle checked={!!c.stacked} onChange={(v) => setC({ stacked: v })} label="ซ้อนกัน" />}
        </Group>
      )}

      {t === 'doughnut' && (
        <Group title="โดนัท">
          <N label="ขนาดรูตรงกลาง (%)" value={c.innerRadius ?? 55} onChange={(v) => setC({ innerRadius: v })} min={10} max={90} />
          <Toggle checked={!!c.centerTotal} onChange={(v) => setC({ centerTotal: v })} label="แสดงผลรวมตรงกลาง" />
        </Group>
      )}

      <Group title="รูปแบบตัวเลข">
        <Field label="หน่วยแสดงผล">
          <Select value={c.unit ?? 'auto'} onChange={(e) => setC({ unit: e.target.value })}>
            <option value="auto">อัตโนมัติ</option><option value="none">ตัวเลขเต็ม</option><option value="thousand">พัน (K)</option><option value="million">ล้าน (M)</option><option value="billion">พันล้าน (B)</option><option value="percent">เปอร์เซ็นต์ (×100)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <N label="ทศนิยม" value={c.decimals} onChange={(v) => setC({ decimals: v })} min={0} max={6} placeholder="auto" />
          <Field label="นำหน้า"><TextInput value={c.prefix ?? ''} onChange={(e) => setC({ prefix: e.target.value })} className="!h-9" placeholder="฿" /></Field>
          <Field label="ต่อท้าย"><TextInput value={c.suffix ?? ''} onChange={(e) => setC({ suffix: e.target.value })} className="!h-9" placeholder="ชิ้น" /></Field>
        </div>
      </Group>

      <Group title="อื่น ๆ">
        <Toggle checked={c.tooltip !== false} onChange={(v) => setC({ tooltip: v })} label="แสดง Tooltip เมื่อชี้เมาส์" />
        <Toggle checked={c.animation !== false} onChange={(v) => setC({ animation: v })} label="เอฟเฟกต์เคลื่อนไหว" />
      </Group>
    </div>
  );
}

/** "Analytics" pane: reference lines, averages, combo series, control-chart limits */
export function ChartAnalytics({ w, set }: Props) {
  const c = w.config;
  const setC = (p: Record<string, unknown>) => set({ config: { ...c, ...p } });
  const t = w.type;
  const refs: RefLine[] = c.refLines ?? [];
  const overrides: SeriesOverride[] = c.seriesOverrides ?? [];
  const comboOk = ['bar', 'line', 'area'].includes(t) && !c.horizontal;
  const nSeries = Math.max(1, w.dataSource?.series.length ?? 1);
  const cartesian = ['bar', 'line', 'area', 'pct', 'pareto', 'histogram', 'xchart', 'xbar', 'scatter'].includes(t);
  return (
    <div className="space-y-2">
      {cartesian && (
        <Group title="เส้นอ้างอิง (Constant line)" open>
          {refs.map((r, i) => (
            <div key={i} className="space-y-1.5 rounded-lg bg-ink/[.03] p-2">
              <div className="flex gap-1.5">
                <TextInput inputMode="decimal" value={r.value ?? ''} className="!h-8 w-24 text-xs" placeholder="ค่า"
                  onChange={(e) => setC({ refLines: refs.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })} />
                <TextInput value={r.label ?? ''} className="!h-8 min-w-0 flex-1 text-xs" placeholder="ป้ายชื่อ เช่น เป้าหมาย"
                  onChange={(e) => setC({ refLines: refs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <button onClick={() => setC({ refLines: refs.filter((_, j) => j !== i) })} className="px-1 text-muted hover:text-danger" aria-label="ลบเส้น"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><ColorInput value={r.color ?? '#E5484D'} onChange={(v) => setC({ refLines: refs.map((x, j) => (j === i ? { ...x, color: v ?? '#E5484D' } : x)) })} /></div>
                <Toggle checked={r.dash !== false} onChange={(v) => setC({ refLines: refs.map((x, j) => (j === i ? { ...x, dash: v } : x)) })} label="ประ" />
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setC({ refLines: [...refs, { value: 0, label: '', color: '#E5484D', dash: true }] })}>เพิ่มเส้นอ้างอิง</Button>
          {t !== 'scatter' && t !== 'xchart' && t !== 'xbar' && <Toggle checked={!!c.avgLine} onChange={(v) => setC({ avgLine: v })} label="เส้นค่าเฉลี่ย" />}
        </Group>
      )}
      {t === 'pareto' && (
        <Group title="Pareto" open>
          <N label="เส้นเป้า % สะสม" value={c.paretoTarget ?? 80} onChange={(v) => setC({ paretoTarget: v })} min={1} max={100} />
        </Group>
      )}
      {(t === 'xchart' || t === 'xbar') && (
        <Group title="Control chart" open>
          <p className="text-xs text-muted">CL, UCL, LCL คำนวณจากข้อมูลอัตโนมัติ ({t === 'xbar' ? 'A2 × R̄ ของกลุ่มย่อย' : 'CL ± 2.66 × MR̄'}) จุดที่หลุด UCL/LCL จะเป็นสีแดง</p>
          <Toggle checked={c.showLimits !== false} onChange={(v) => setC({ showLimits: v })} label="แสดง UCL / LCL" />
          <Toggle checked={c.bandShade !== false} onChange={(v) => setC({ bandShade: v })} label="แรเงาช่วงควบคุม" />
          <div className="grid grid-cols-2 gap-2">
            <N label="USL (Spec บน)" value={c.usl === '' ? undefined : c.usl} onChange={(v) => setC({ usl: v })} />
            <N label="LSL (Spec ล่าง)" value={c.lsl === '' ? undefined : c.lsl} onChange={(v) => setC({ lsl: v })} />
          </div>
        </Group>
      )}
      {comboOk && (
        <Group title="ชุดข้อมูลแบบผสม (Combo)">
          <p className="text-xs text-muted">กำหนดชนิดกราฟ แกน และสี แยกตามชุดข้อมูล เช่น ยอดผลิตเป็นแท่ง + %ของเสียเป็นเส้นแกนขวา</p>
          {Array.from({ length: nSeries }).map((_, i) => {
            const o = overrides[i] ?? {};
            const upd = (p: Partial<SeriesOverride>) => { const arr = [...overrides]; arr[i] = { ...arr[i], ...p }; setC({ seriesOverrides: arr }); };
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-5 text-xs text-muted">{i + 1}</span>
                <Select value={o.type ?? ''} className="min-w-0 flex-1" onChange={(e) => upd({ type: (e.target.value || undefined) as SeriesOverride['type'] })}>
                  <option value="">ตามกราฟ</option><option value="bar">แท่ง</option><option value="line">เส้น</option><option value="area">พื้นที่</option>
                </Select>
                <Select value={o.axis ?? 'left'} className="w-24 shrink-0" onChange={(e) => upd({ axis: e.target.value as SeriesOverride['axis'] })}>
                  <option value="left">แกนซ้าย</option><option value="right">แกนขวา</option>
                </Select>
              </div>
            );
          })}
          {overrides.length > 0 && <Button size="sm" variant="ghost" onClick={() => setC({ seriesOverrides: [] })}>ล้างการตั้งค่าผสม</Button>}
        </Group>
      )}
      {!cartesian && <p className="rounded-xl bg-ink/[.04] p-3 text-xs text-muted">กราฟชนิดนี้ไม่มีตัวเลือกวิเคราะห์เพิ่มเติม</p>}
    </div>
  );
}
