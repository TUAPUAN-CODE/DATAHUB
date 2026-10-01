import type { Column } from '@/types';

const TOKEN = /\{(PREFIX|YYYYMMDD|YYMMDD|YYYY|YYMM|YY|MM|DD|BBBB|BB|SEQ(?::(\d{1,2}))?)\}/g;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const DOC_TOKENS: { token: string; label: string }[] = [
  { token: '{PREFIX}', label: 'หัวเลข (เลือกจากรายการ)' },
  { token: '{YYMMDD}', label: 'ปี เดือน วัน (260926)' },
  { token: '{YYYYMMDD}', label: 'ปี ค.ศ. 4 หลัก + เดือน วัน' },
  { token: '{YYYY}', label: 'ปี ค.ศ. (2026)' },
  { token: '{YY}', label: 'ปี ค.ศ. 2 หลัก (26)' },
  { token: '{BBBB}', label: 'ปี พ.ศ. (2569)' },
  { token: '{BB}', label: 'ปี พ.ศ. 2 หลัก (69)' },
  { token: '{MM}', label: 'เดือน (09)' },
  { token: '{DD}', label: 'วัน (26)' },
  { token: '{SEQ:3}', label: 'เลขฉบับ (009) — เริ่มใหม่เมื่อส่วนอื่นเปลี่ยน' },
];

export const hasPrefixToken = (t: string) => /\{PREFIX\}/.test(t);
export const seqWidth = (t: string) => Number(/\{SEQ:(\d{1,2})\}/.exec(t)?.[1] ?? 1);

/** Example of a generated number (same rules as the server) */
export function renderDocPreview(template: string, prefix: string | null, seq = 1, date = new Date()): string {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate(), be = y + 543;
  return template.replace(TOKEN, (_x, tok: string, w?: string) => {
    if (tok.startsWith('SEQ')) return pad(seq, w ? Number(w) : 1);
    switch (tok) {
      case 'PREFIX': return prefix ?? '';
      case 'YYYY': return String(y);
      case 'YY': return pad(y % 100);
      case 'MM': return pad(m);
      case 'DD': return pad(d);
      case 'YYMMDD': return `${pad(y % 100)}${pad(m)}${pad(d)}`;
      case 'YYYYMMDD': return `${y}${pad(m)}${pad(d)}`;
      case 'YYMM': return `${pad(y % 100)}${pad(m)}`;
      case 'BBBB': return String(be);
      case 'BB': return pad(be % 100);
      default: return '';
    }
  });
}

export const docCfgOf = (col: Pick<Column, 'dataType' | 'validation'>) => (col.dataType === 'doc_number' ? col.validation?.docNumber ?? null : null);
