import { idList, jsonParam, q } from '../config/db';
import { AuthUser } from '../middleware/auth';
import { DataType, fromStorage } from '../shared/cellValue';
import { badRequest, clamp, safeJson } from '../shared/http';
import { LV, requireSheet } from '../shared/permissions';
import { loadColumns } from './cellWriter';
import { baseWhere, ColumnFilter, Params } from './rowQuery';

export type Agg = 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max' | 'none';
export type Bucket = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface SeriesDef {
  columnId?: string | null;
  aggregation: Agg;
  label?: string | null;
}

export interface DataSource {
  sheetId: string;
  xColumnId?: string | null;
  xBucket?: Bucket;
  series: SeriesDef[];
  groupByColumnId?: string | null;
  filters?: ColumnFilter[];
  sort?: 'x_asc' | 'x_desc' | 'value_asc' | 'value_desc';
  limit?: number;
}

const AGG_TH: Record<Agg, string> = {
  sum: 'ผลรวม',
  avg: 'ค่าเฉลี่ย',
  count: 'จำนวน',
  count_distinct: 'จำนวนไม่ซ้ำ',
  min: 'ต่ำสุด',
  max: 'สูงสุด',
  none: '',
};
const BLANK = '(ว่าง)';

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((+t - +y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

function bucketOf(v: string, bucket: Bucket) {
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(+d)) return v;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (bucket) {
    case 'year':
      return String(y);
    case 'quarter':
      return `${y}-Q${Math.ceil(m / 3)}`;
    case 'month':
      return `${y}-${String(m).padStart(2, '0')}`;
    case 'week':
      return isoWeek(d);
    default:
      return d.toISOString().slice(0, 10);
  }
}

function categoryKeys(v: unknown, col: any, bucket: Bucket): string[] {
  if (v === null || v === undefined || v === '') return [BLANK];
  const t = col.data_type as DataType;
  const options: { value: string; label: string }[] = safeJson(col.select_options, []) ?? [];
  const label = (s: string) => options.find((o) => o.value === s)?.label ?? s;
  if (t === 'multi_select' && Array.isArray(v)) return v.length ? v.map((x) => label(String(x))) : [BLANK];
  if (t === 'select') return [label(String(v))];
  if (t === 'boolean') return [v ? 'ใช่' : 'ไม่ใช่'];
  if ((t === 'date' || t === 'datetime') && bucket !== 'none') return [bucketOf(String(v), bucket)];
  if (t === 'datetime') return [String(v).slice(0, 10)];
  return [String(v)];
}

const numeric = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function aggregate(values: unknown[], agg: Agg): number | null {
  if (agg === 'count') return values.length;
  if (agg === 'count_distinct') return new Set(values.filter((v) => v !== null && v !== undefined).map((v) => JSON.stringify(v))).size;
  const nums = values.map(numeric).filter((n): n is number => n !== null);
  if (!nums.length) return agg === 'sum' ? 0 : null;
  switch (agg) {
    case 'sum':
    case 'none':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
  }
  return null;
}

const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

export async function computeWidgetData(user: AuthUser, ds: DataSource) {
  await requireSheet(user, ds.sheetId, LV.read);
  const cols = await loadColumns(ds.sheetId);
  const colMap = new Map(cols.map((c) => [c.column_id, c]));
  const need = [ds.xColumnId, ds.groupByColumnId, ...ds.series.map((s) => s.columnId)].filter(
    (x): x is string => !!x,
  );
  for (const id of need) if (!colMap.has(id)) throw badRequest('คอลัมน์ที่เลือกไม่มีอยู่แล้ว กรุณาเลือกใหม่');

  const p = new Params();
  const where = baseWhere(ds.sheetId, colMap, p, { filters: ds.filters });
  const rowIds = await q(`SELECT TOP 200000 r.row_id FROM Rows r WHERE ${where}`, p.values);
  const records = new Map<string, Record<string, unknown>>(rowIds.map((r) => [r.row_id, {}]));
  const uniqueNeed = [...new Set(need)];
  if (uniqueNeed.length && records.size) {
    const cells = await q(
      `SELECT wc.row_id, wc.column_id, wc.value_text, wc.value_int, wc.value_float, wc.value_date, wc.value_bool, wc.value_json
       FROM Cells wc JOIN Rows r ON r.row_id = wc.row_id
       WHERE ${where} AND wc.column_id IN ${idList('@wcols')}`,
      { ...p.values, wcols: jsonParam(uniqueNeed) },
    );
    for (const c of cells) {
      const rec = records.get(c.row_id);
      if (rec) rec[c.column_id] = fromStorage(colMap.get(c.column_id).data_type, c);
    }
  }
  const all = [...records.values()];
  const seriesName = (s: SeriesDef) =>
    s.label || (s.aggregation === 'count' && !s.columnId ? 'จำนวนแถว' : `${AGG_TH[s.aggregation]} ${colMap.get(s.columnId ?? '')?.column_name ?? ''}`.trim());

  // KPI / single value mode
  if (!ds.xColumnId) {
    return {
      categories: ['ทั้งหมด'],
      series: ds.series.map((s, i) => ({
        key: `s${i}`,
        name: seriesName(s),
        values: [aggregate(s.columnId ? all.map((r) => r[s.columnId!] ?? null) : all.map(() => 1), s.aggregation)],
      })),
      points: [],
      totalRows: all.length,
    };
  }

  const xCol = colMap.get(ds.xColumnId);
  const bucket = ds.xBucket ?? 'none';

  // Scatter / raw points mode
  if (ds.series[0]?.aggregation === 'none') {
    const s = ds.series[0];
    const points = all
      .map((r) => ({ x: numeric(r[ds.xColumnId!]) ?? r[ds.xColumnId!], y: numeric(r[s.columnId ?? '']) }))
      .filter((pt) => pt.x !== null && pt.x !== undefined && pt.y !== null)
      .slice(0, 5000);
    return { categories: [], series: [{ key: 's0', name: seriesName(s), values: [] }], points, totalRows: all.length };
  }

  const groups = new Map<string, Map<string, unknown[]>>();
  const seriesKeys: { key: string; name: string; agg: Agg }[] = [];
  if (ds.groupByColumnId) {
    const s = ds.series[0];
    const gCol = colMap.get(ds.groupByColumnId);
    const seen = new Set<string>();
    for (const r of all) {
      const gk = categoryKeys(r[ds.groupByColumnId], gCol, 'none')[0];
      if (!seen.has(gk)) {
        seen.add(gk);
        seriesKeys.push({ key: `g:${gk}`, name: gk, agg: s.aggregation });
      }
      for (const xk of categoryKeys(r[ds.xColumnId], xCol, bucket)) {
        if (!groups.has(xk)) groups.set(xk, new Map());
        const g = groups.get(xk)!;
        if (!g.has(`g:${gk}`)) g.set(`g:${gk}`, []);
        g.get(`g:${gk}`)!.push(s.columnId ? r[s.columnId] ?? null : 1);
      }
    }
    seriesKeys.sort((a, b) => collator.compare(a.name, b.name));
  } else {
    ds.series.forEach((s, i) => seriesKeys.push({ key: `s${i}`, name: seriesName(s), agg: s.aggregation }));
    for (const r of all) {
      for (const xk of categoryKeys(r[ds.xColumnId], xCol, bucket)) {
        if (!groups.has(xk)) groups.set(xk, new Map());
        const g = groups.get(xk)!;
        ds.series.forEach((s, i) => {
          if (!g.has(`s${i}`)) g.set(`s${i}`, []);
          g.get(`s${i}`)!.push(s.columnId ? r[s.columnId] ?? null : 1);
        });
      }
    }
  }

  let categories = [...groups.keys()];
  const firstTotal = (c: string) => aggregate(groups.get(c)!.get(seriesKeys[0]?.key ?? '') ?? [], seriesKeys[0]?.agg ?? 'count') ?? 0;
  const numericX = xCol.data_type === 'int' || xCol.data_type === 'float';
  const xCompare = (a: string, b: string) =>
    a === BLANK ? 1 : b === BLANK ? -1 : numericX ? Number(a) - Number(b) : collator.compare(a, b);
  switch (ds.sort ?? 'x_asc') {
    case 'x_desc':
      categories.sort((a, b) => -xCompare(a, b));
      break;
    case 'value_asc':
      categories.sort((a, b) => firstTotal(a) - firstTotal(b));
      break;
    case 'value_desc':
      categories.sort((a, b) => firstTotal(b) - firstTotal(a));
      break;
    default:
      categories.sort(xCompare);
  }
  categories = categories.slice(0, clamp(ds.limit ?? 50, 1, 500));

  return {
    categories,
    series: seriesKeys.map((s) => ({
      key: s.key,
      name: s.name,
      values: categories.map((c) => {
        const vals = groups.get(c)?.get(s.key);
        return vals ? aggregate(vals, s.agg) : null;
      }),
    })),
    points: [],
    totalRows: all.length,
  };
}
