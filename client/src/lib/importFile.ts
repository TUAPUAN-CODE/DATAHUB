export interface ParsedSheet { name: string; rows: unknown[][] }

/** RFC-4180 style CSV / TSV parser (quotes, escaped quotes, newlines inside cells). The delimiter is detected from the first line. */
export function parseDelimited(text: string): unknown[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = [',', ';', '\t'].map((d) => ({ d, n: count(d) })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Excel gives dates as Date objects holding the wall-clock time in UTC fields */
function fromDate(d: Date): string {
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (!d.getUTCHours() && !d.getUTCMinutes() && !d.getUTCSeconds()) return date;
  return `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function cellValue(v: any): unknown {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return fromDate(v);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result); // formula
    if ('richText' in v) return (v.richText as { text: string }[]).map((p) => p.text).join('');
    if ('text' in v) return cellValue(v.text); // hyperlink
    if ('error' in v) return '';
    return String(v);
  }
  return v;
}

/** Reads every worksheet of an .xlsx file, or the single table of a .csv / .tsv / .txt file */
export async function parseTableFile(file: File): Promise<ParsedSheet[]> {
  const name = file.name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(name)) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-874').decode(buf); // Thai Excel "CSV" saved in the ANSI code page
    return [{ name: file.name, rows: parseDelimited(text) }];
  }
  if (!name.endsWith('.xlsx')) throw new Error('รองรับไฟล์ .xlsx, .csv, .tsv เท่านั้น (ไฟล์ .xls เก่าให้เปิดด้วย Excel แล้วบันทึกเป็น .xlsx)');
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(row.getCell(c).value));
      rows[n - 1] = vals;
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    return { name: ws.name, rows };
  });
}

export const normHeader = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
