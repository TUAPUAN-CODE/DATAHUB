import { alertColor } from '@/modules/alerts/level';
import type { Column, Row } from '@/types';
import { displayValue } from './format';

const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Downloads rows as UTF-8 CSV with BOM so Excel shows Thai correctly */
export function downloadCsv(filename: string, columns: Column[], rows: Row[]) {
  const lines = [['#', ...columns.map((c) => c.name)].map(esc).join(',')];
  for (const r of rows) lines.push([String(r.order), ...columns.map((c) => displayValue(c, r.values[c.id] ?? null))].map(esc).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Parses clipboard text copied from Excel/Sheets (TSV with quoted cells) */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
export const toTsv = (grid: string[][]) =>
  grid.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n');

/** Downloads rows as a real .xlsx workbook (numbers, dates and booleans keep their type). exceljs is loaded on demand. */
export async function downloadXlsx(filename: string, sheetName: string, columns: Column[], rows: Row[]) {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  const ws = wb.addWorksheet(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ header: '#', key: '__n', width: 6 }, ...columns.map((c) => ({ header: c.name, key: c.id, width: Math.max(10, Math.min(48, Math.round(c.width / 7))) }))];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1552F0' } };
  head.alignment = { vertical: 'middle' };
  for (const r of rows) {
    const vals: Record<string, unknown> = { __n: r.order };
    for (const c of columns) {
      const v = r.values[c.id] ?? null;
      if (v === null || v === '') vals[c.id] = null;
      else if ((c.dataType === 'int' || c.dataType === 'float') && typeof v === 'number') vals[c.id] = v;
      else if (c.dataType === 'boolean') vals[c.id] = v === true;
      else if ((c.dataType === 'date' || c.dataType === 'datetime') && typeof v === 'string' && !Number.isNaN(Date.parse(v))) vals[c.id] = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
      else vals[c.id] = displayValue(c, v);
    }
    const added = ws.addRow(vals);
    columns.forEach((c, i) => { // colour alerts, measured at the moment of export
      const cfg = c.validation?.alert;
      const a = cfg ? alertColor(cfg, r.values, Date.now()) : null;
      if (a) added.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${a.color.slice(1).toUpperCase()}` } };
    });
  }
  columns.forEach((c, i) => { if (c.dataType === 'date') ws.getColumn(i + 2).numFmt = 'yyyy-mm-dd'; else if (c.dataType === 'datetime') ws.getColumn(i + 2).numFmt = 'yyyy-mm-dd hh:mm'; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length + 1 } };
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
