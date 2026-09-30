import { useEffect, useState } from 'react';
import { apiError } from '@/api/client';
import { dashboardsApi } from '@/api/endpoints';
import type { DataSource, WidgetData, WidgetType } from '@/types';

/** Chart-like widgets that need a category (X) column */
export const CHART_TYPES: WidgetType[] = ['bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'heatmap', 'pareto', 'histogram', 'xchart', 'xbar', 'pct'];
export const DATA_TYPES_W: WidgetType[] = [...CHART_TYPES, 'kpi', 'table'];
export const needsX = (t: WidgetType) => t !== 'kpi';

const cache = new Map<string, { at: number; data: WidgetData }>();

export function dsValid(type: WidgetType, ds: DataSource | null | undefined): ds is DataSource {
  if (!ds?.sheetId || !ds.series?.length) return false;
  if (needsX(type) && !ds.xColumnId) return false;
  if (type === 'scatter' && !ds.series[0].columnId) return false;
  if (type === 'heatmap' && !ds.groupByColumnId && ds.series.length < 1) return false;
  if ((type === 'xchart' || type === 'xbar') && !ds.series[0].columnId) return false;
  return ds.series.every((s) => s.aggregation === 'count' || !!s.columnId);
}

export function useWidgetData(type: WidgetType, ds: DataSource | null, refreshKey: number) {
  const [state, setState] = useState<{ data?: WidgetData; error?: string; loading: boolean }>({ loading: false });
  const key = ds ? `${refreshKey}|${JSON.stringify(ds)}` : '';
  useEffect(() => {
    if (!ds || !(type === 'kpi' || type === 'card' || type === 'condition' ? !!ds.sheetId : dsValid(type, ds))) { setState({ loading: false }); return; }
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
