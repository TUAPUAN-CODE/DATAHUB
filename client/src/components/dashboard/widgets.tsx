import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AreaChart as AreaIcon, BarChart3, Circle, Donut, Gauge, ImageIcon, LineChart as LineIcon, PieChart as PieIcon, ScatterChart as ScatterIcon, Table2, Type } from 'lucide-react';
import { apiError } from '@/api/client';
import { dashboardsApi } from '@/api/endpoints';
import { ensureFont } from '@/lib/fonts';
import { compactNumber, fmtNumber } from '@/lib/format';
import { SHADOWS } from '@/lib/theme';
import { useTheme } from '@/store/theme';
import type { DataSource, Widget, WidgetData, WidgetType } from '@/types';

export const PALETTE = ['#1552F0', '#16A34A', '#F59E0B', '#E5484D', '#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#64748B'];
export const CHART_TYPES: WidgetType[] = ['bar', 'line', 'area', 'pie', 'doughnut', 'scatter'];
export const DATA_TYPES_W: WidgetType[] = [...CHART_TYPES, 'kpi', 'table'];
export const needsX = (t: WidgetType) => t !== 'kpi';

export const WIDGETS: { type: WidgetType; label: string; icon: JSX.Element; w: number; h: number }[] = [
  { type: 'bar', label: 'แท่ง', icon: <BarChart3 />, w: 520, h: 340 },
  { type: 'line', label: 'เส้น', icon: <LineIcon />, w: 520, h: 340 },
  { type: 'area', label: 'พื้นที่', icon: <AreaIcon />, w: 520, h: 340 },
  { type: 'pie', label: 'วงกลม', icon: <PieIcon />, w: 380, h: 340 },
  { type: 'doughnut', label: 'โดนัท', icon: <Donut />, w: 380, h: 340 },
  { type: 'scatter', label: 'กระจาย', icon: <ScatterIcon />, w: 480, h: 340 },
  { type: 'kpi', label: 'ตัวเลข KPI', icon: <Gauge />, w: 300, h: 150 },
  { type: 'table', label: 'ตารางสรุป', icon: <Table2 />, w: 480, h: 320 },
  { type: 'text', label: 'ข้อความ', icon: <Type />, w: 420, h: 80 },
  { type: 'image', label: 'รูปภาพ', icon: <ImageIcon />, w: 360, h: 240 },
  { type: 'shape', label: 'รูปทรง', icon: <Circle />, w: 220, h: 160 },
];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

export function newWidget(type: WidgetType, x: number, y: number, z: number, sheetId: string | null): Widget {
  const def = WIDGETS.find((w) => w.type === type)!;
  const base: Widget = { id: uid(), type, title: def.label, x, y, w: def.w, h: def.h, z, locked: false, config: {}, style: { showTitle: true }, dataSource: null };
  if (DATA_TYPES_W.includes(type) && sheetId)
    base.dataSource = { sheetId, xColumnId: null, xBucket: 'none', series: [{ columnId: null, aggregation: 'count' }], sort: type === 'pie' || type === 'doughnut' ? 'value_desc' : 'x_asc', limit: 20 };
  if (type === 'text') Object.assign(base, { title: '', config: { text: 'พิมพ์ข้อความ', fontSize: 24, fontWeight: 600, align: 'left', color: '' }, style: { showTitle: false, bg: 'transparent', borderWidth: 0, shadow: 'none', padding: 4 } });
  if (type === 'image') Object.assign(base, { title: '', config: { url: '', fit: 'cover' }, style: { showTitle: false, padding: 0 } });
  if (type === 'shape') Object.assign(base, { title: '', config: { shape: 'rect', fill: '#1552F0', stroke: 'transparent', strokeWidth: 0 }, style: { showTitle: false, bg: 'transparent', borderWidth: 0, shadow: 'none', padding: 0, radius: 16 } });
  if (type === 'kpi') base.config = { decimals: 0, color: '', prefix: '', suffix: '' };
  if (CHART_TYPES.includes(type)) base.config = { legend: true, grid: true, labels: false, colors: PALETTE.slice(0, 6) };
  if (type === 'scatter' && base.dataSource) base.dataSource.series = [{ columnId: null, aggregation: 'none' }];
  return base;
}

/* ---------------- data ---------------- */
const cache = new Map<string, { at: number; data: WidgetData }>();
export function dsValid(type: WidgetType, ds: DataSource | null): ds is DataSource {
  if (!ds?.sheetId || !ds.series?.length) return false;
  if (needsX(type) && !ds.xColumnId) return false;
  if (type === 'scatter' && !ds.series[0].columnId) return false;
  return ds.series.every((s) => s.aggregation === 'count' || !!s.columnId);
}
export function useWidgetData(type: WidgetType, ds: DataSource | null, refreshKey: number) {
  const [state, setState] = useState<{ data?: WidgetData; error?: string; loading: boolean }>({ loading: false });
  const key = ds ? `${refreshKey}|${JSON.stringify(ds)}` : '';
  useEffect(() => {
    if (!dsValid(type, ds)) { setState({ loading: false }); return; }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) { setState({ data: hit.data, loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const t = setTimeout(() => {
      dashboardsApi.data(ds).then((d) => { cache.set(key, { at: Date.now(), data: d }); if (live) setState({ data: d, loading: false }); })
        .catch((e) => live && setState({ error: apiError(e).message, loading: false }));
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [key, type]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/* ---------------- rendering ---------------- */
function ChartBody({ w, data }: { w: Widget; data: WidgetData }) {
  const colors = useTheme((s) => s.draft.colors);
  const cfg = w.config;
  const pal: string[] = cfg.colors?.length ? cfg.colors : PALETTE;
  const axis = { fill: colors.muted, fontSize: 11 };
  const rows = data.categories.map((c, i) => ({ name: c, ...Object.fromEntries(data.series.map((s) => [s.key, s.values[i]])) }));
  const tooltip = <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontSize: 12 }} formatter={(v: any) => fmtNumber(Number(v), 2)} cursor={{ fill: `${colors.primary}10` }} />;
  const legend = cfg.legend !== false && data.series.length > 0 ? <Legend wrapperStyle={{ fontSize: 12, color: colors.text }} iconType="circle" iconSize={8} /> : null;
  const grid = cfg.grid !== false ? <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} /> : null;
  const angle = Number(cfg.xAngle ?? 0);
  const xAxis = <XAxis dataKey="name" tick={axis} stroke={colors.border} angle={angle} textAnchor={angle ? 'end' : 'middle'} height={angle ? 60 : 30} interval="preserveStartEnd" />;
  const yAxis = <YAxis tick={axis} stroke={colors.border} tickFormatter={(v) => compactNumber(v)} width={48} />;

  if (w.type === 'pie' || w.type === 'doughnut') {
    const s = data.series[0];
    const pd = data.categories.map((c, i) => ({ name: c, value: s?.values[i] ?? 0 })).filter((d) => d.value);
    return (
      <ResponsiveContainer>
        <PieChart>
          {tooltip}{legend}
          <Pie data={pd} dataKey="value" nameKey="name" innerRadius={w.type === 'doughnut' ? '55%' : 0} outerRadius="80%" paddingAngle={w.type === 'doughnut' ? 2 : 0}
            label={cfg.labels ? ({ percent }: any) => `${Math.round(percent * 100)}%` : false} labelLine={false} isAnimationActive stroke={colors.surface}>
            {pd.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (w.type === 'scatter')
    return (
      <ResponsiveContainer>
        <ScatterChart>
          {grid}{tooltip}
          <XAxis dataKey="x" type="number" tick={axis} stroke={colors.border} name="X" />
          <YAxis dataKey="y" type="number" tick={axis} stroke={colors.border} width={48} name="Y" />
          <Scatter data={data.points as any[]} fill={pal[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  if (w.type === 'line')
    return (
      <ResponsiveContainer>
        <LineChart data={rows}>
          {grid}{xAxis}{yAxis}{tooltip}{legend}
          {data.series.map((s, i) => (
            <Line key={s.key} dataKey={s.key} name={s.name} type={cfg.curve ?? 'monotone'} stroke={pal[i % pal.length]} strokeWidth={2.5} dot={rows.length <= 31 ? { r: 3 } : false} connectNulls>
              {cfg.labels && <LabelList dataKey={s.key} position="top" fontSize={10} fill={colors.muted} formatter={(v: any) => compactNumber(v)} />}
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  if (w.type === 'area')
    return (
      <ResponsiveContainer>
        <AreaChart data={rows}>
          <defs>{data.series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${w.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={pal[i % pal.length]} stopOpacity={0.35} /><stop offset="100%" stopColor={pal[i % pal.length]} stopOpacity={0.02} />
            </linearGradient>))}</defs>
          {grid}{xAxis}{yAxis}{tooltip}{legend}
          {data.series.map((s, i) => (
            <Area key={s.key} dataKey={s.key} name={s.name} type={cfg.curve ?? 'monotone'} stroke={pal[i % pal.length]} strokeWidth={2.5} fill={`url(#g-${w.id}-${i})`} stackId={cfg.stacked ? 'a' : undefined} connectNulls />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  const horizontal = !!cfg.horizontal;
  return (
    <ResponsiveContainer>
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} barCategoryGap="22%">
        {cfg.grid !== false && <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={horizontal} horizontal={!horizontal} />}
        {horizontal ? <><XAxis type="number" tick={axis} stroke={colors.border} tickFormatter={(v) => compactNumber(v)} /><YAxis type="category" dataKey="name" tick={axis} stroke={colors.border} width={96} /></> : <>{xAxis}{yAxis}</>}
        {tooltip}{legend}
        {data.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={pal[i % pal.length]} stackId={cfg.stacked ? 'a' : undefined} radius={cfg.stacked ? 0 : horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={56}>
            {cfg.labels && <LabelList dataKey={s.key} position={horizontal ? 'right' : 'top'} fontSize={10} fill={colors.muted} formatter={(v: any) => compactNumber(v)} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function KpiBody({ w, data }: { w: Widget; data: WidgetData }) {
  const primary = useTheme((s) => s.draft.colors.primary);
  const c = w.config;
  const v = data.series[0]?.values[0];
  const target = c.target !== undefined && c.target !== '' && c.target !== null ? Number(c.target) : null;
  const hit = target !== null && v !== null && v !== undefined ? v >= target : null;
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="truncate font-semibold leading-none tracking-tight tabular-nums" style={{ color: c.color || primary, fontSize: `clamp(20px, ${Math.min(w.h * 0.34, w.w * 0.16)}px, 72px)` }}>
        {c.prefix}{v === null || v === undefined ? '–' : fmtNumber(v, c.decimals ?? 0)}{c.suffix}
      </p>
      <p className="mt-2 truncate text-xs opacity-70">
        {target !== null ? <span style={{ color: hit ? 'rgb(var(--c-success))' : 'rgb(var(--c-danger))' }}>{hit ? '▲ ถึงเป้า' : '▼ ต่ำกว่าเป้า'} {fmtNumber(target, c.decimals ?? 0)}</span> : `จาก ${data.totalRows.toLocaleString()} แถว`}
      </p>
    </div>
  );
}

function TableBody({ w, data }: { w: Widget; data: WidgetData }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-inherit"><tr className="text-left text-xs opacity-70">
          <th className="py-1.5 pr-3 font-medium">หมวด</th>{data.series.map((s) => <th key={s.key} className="py-1.5 pr-2 text-right font-medium">{s.name}</th>)}
        </tr></thead>
        <tbody>
          {data.categories.map((c, i) => (
            <tr key={c} className="border-t border-current/10" style={{ borderColor: 'rgb(var(--c-border))' }}>
              <td className="py-1.5 pr-3">{c}</td>
              {data.series.map((s) => <td key={s.key} className="py-1.5 pr-2 text-right tabular-nums">{fmtNumber(s.values[i] ?? null, w.config.decimals ?? 2)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WidgetView({ w, refreshKey, editing }: { w: Widget; refreshKey: number; editing?: boolean }) {
  const isData = DATA_TYPES_W.includes(w.type);
  const { data, error, loading } = useWidgetData(w.type, isData ? w.dataSource : null, refreshKey);
  const s = w.style ?? {};
  const cfg = w.config ?? {};
  useEffect(() => { if (w.type === 'text' && cfg.fontFamily) ensureFont(cfg.fontFamily); }, [w.type, cfg.fontFamily]);

  const frame: React.CSSProperties = {
    background: s.bg ?? 'var(--widget-bg)', color: s.text || 'var(--widget-text)',
    border: `${s.borderWidth ?? 'var(--widget-bw)'}${s.borderWidth !== undefined ? 'px' : ''} solid ${s.border ?? 'var(--widget-border)'}`,
    borderRadius: s.radius !== undefined ? s.radius : 'var(--widget-radius)', boxShadow: s.shadow ? SHADOWS[s.shadow] : 'var(--widget-shadow)',
    padding: s.padding !== undefined ? s.padding : 'var(--widget-pad)', opacity: s.opacity ?? 1,
  };

  let body: React.ReactNode = null;
  if (isData) {
    if (!dsValid(w.type, w.dataSource)) body = <p className="grid h-full place-items-center text-center text-xs opacity-60">{editing ? 'เลือกข้อมูลที่แผง “ข้อมูล” ด้านขวา' : 'ยังไม่ได้ตั้งค่าข้อมูล'}</p>;
    else if (error) body = <p className="grid h-full place-items-center px-2 text-center text-xs text-danger">{error}</p>;
    else if (!data) body = <div className="skeleton h-full w-full" />;
    else if (w.type === 'kpi') body = <KpiBody w={w} data={data} />;
    else if (w.type === 'table') body = <TableBody w={w} data={data} />;
    else body = <ChartBody w={w} data={data} />;
  } else if (w.type === 'text') {
    body = (
      <div className="flex h-full w-full overflow-hidden whitespace-pre-wrap break-words" style={{
        fontSize: cfg.fontSize ?? 18, fontWeight: cfg.fontWeight ?? 400, textAlign: cfg.align ?? 'left', color: cfg.color || undefined,
        fontStyle: cfg.italic ? 'italic' : undefined, fontFamily: cfg.fontFamily ? `'${cfg.fontFamily}', var(--font)` : undefined, lineHeight: 1.35,
        alignItems: cfg.valign === 'middle' ? 'center' : cfg.valign === 'bottom' ? 'flex-end' : 'flex-start',
      }}><span className="w-full">{cfg.text}</span></div>
    );
  } else if (w.type === 'image') {
    body = cfg.url ? <img src={cfg.url} alt={w.title || 'image'} draggable={false} className="h-full w-full" style={{ objectFit: cfg.fit ?? 'cover', borderRadius: 'inherit' }} />
      : <div className="grid h-full place-items-center rounded-[inherit] bg-ink/5 text-xs opacity-60"><ImageIcon className="h-8 w-8" /></div>;
  } else if (w.type === 'shape') {
    const sh = cfg.shape ?? 'rect';
    body = sh === 'line'
      ? <div className="flex h-full items-center"><div className="w-full" style={{ height: Math.max(1, cfg.strokeWidth || 3), background: cfg.fill || '#1552F0', borderRadius: 99 }} /></div>
      : <div className="h-full w-full" style={{ background: cfg.fill, border: `${cfg.strokeWidth ?? 0}px solid ${cfg.stroke ?? 'transparent'}`, borderRadius: sh === 'ellipse' ? '50%' : s.radius ?? 16 }} />;
  }

  const showTitle = s.showTitle !== false && !!w.title && !['text', 'shape', 'image'].includes(w.type);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden" style={w.type === 'shape' ? { opacity: s.opacity ?? 1 } : frame}>
      {showTitle && (
        <div className="mb-2 flex shrink-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: s.titleSize ?? 15 }}>{w.title}</p>
          {loading && data && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
        </div>
      )}
      <div className="relative min-h-0 flex-1">{body}</div>
    </div>
  );
}
