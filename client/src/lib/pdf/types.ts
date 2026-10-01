import type { Column } from '@/types';

export const MM = 2.83465; // millimetres → PDF points

export type PageSize = 'A3' | 'A4' | 'A5' | 'LETTER' | 'LEGAL';
export type Align = 'left' | 'center' | 'right' | 'justify';
export const PDF_FONTS = ['Sarabun', 'Prompt', 'Kanit'] as const;
export type PdfFont = (typeof PDF_FONTS)[number];

export interface TextStyle {
  font?: PdfFont; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; bg?: string;
  align?: Align; lineHeight?: number;
}

export interface BlockBase {
  id: string;
  name?: string;
  marginTop?: number; marginBottom?: number; marginLeft?: number; marginRight?: number; // mm
  pageBreakBefore?: boolean; pageBreakAfter?: boolean;
  /** absolute position in mm from the page corner (text / image / line); null = flows with the content */
  position?: { x: number; y: number } | null;
}
export interface TextBlock extends BlockBase { type: 'text'; text: string; style: TextStyle; border?: { color: string; width: number; padding: number } | null }
export interface ImageBlock extends BlockBase {
  type: 'image'; source: 'static' | 'column'; url: string; widthMm: number; heightMm?: number | null; align: Align;
  columnId?: string | null; columnName?: string | null; maxImages?: number;
}
export interface LineBlock extends BlockBase { type: 'line'; thickness: number; color: string; widthPct: number; dash?: boolean }
export interface SpacerBlock extends BlockBase { type: 'spacer'; height: number }
export interface PageBreakBlock extends BlockBase { type: 'pageBreak' }
export interface ColumnsBlock extends BlockBase {
  type: 'columns'; gap: number; cols: { widthPct: number; blocks: (TextBlock | ImageBlock)[] }[];
}
export interface TableCol { columnId: string; columnName: string; header?: string; widthMm?: number | null; align?: Align }
export type Agg = 'sum' | 'avg' | 'count' | 'min' | 'max';
export interface TableBlock extends BlockBase {
  type: 'table'; sheetId: string; sheetName: string; columns: TableCol[];
  /** rows on each page; the table continues on a NEW page after that many rows. null = fill the page */
  rowsPerPage: number | null; limit: number | null; widthPct: number; align: 'left' | 'center' | 'right';
  header: { bg: string; color: string; bold: boolean; fontSize: number; align: Align };
  body: { fontSize: number; color: string; zebra: string | null; lineHeight: number };
  border: { color: string; width: number }; padding: number;
  showRowNumber: boolean; rowNumberHeader: string; repeatHeader: boolean; useCurrentFilters: boolean;
  imageSizeMm: number; maxImagesPerCell: number;
  summary: { columnId: string; agg: Agg; label?: string }[]; summaryLabel: string;
  /** a line of text before the table (supports tokens) */ caption?: string;
}
export interface FieldsBlock extends BlockBase {
  type: 'fields'; columns: TableCol[]; perRow: 1 | 2 | 3; label: TextStyle; value: TextStyle; border: { color: string; width: number } | null; imageSizeMm: number;
}
export type Block = TextBlock | ImageBlock | LineBlock | SpacerBlock | PageBreakBlock | ColumnsBlock | TableBlock | FieldsBlock;
export type BlockType = Block['type'];

export interface PdfTemplate {
  id: string;
  name: string;
  /** table = one report with tables; perRow = one form page per row (fields + {{Column}} tokens) */
  mode: 'table' | 'perRow';
  perRow?: { sheetId: string; sheetName: string; onlySelected: boolean };
  page: { size: PageSize; orientation: 'portrait' | 'landscape'; margins: { top: number; right: number; bottom: number; left: number } };
  base: { font: PdfFont; fontSize: number; color: string };
  header: { enabled: boolean; blocks: (TextBlock | ImageBlock | ColumnsBlock | LineBlock | SpacerBlock)[] };
  footer: { enabled: boolean; blocks: (TextBlock | ImageBlock | ColumnsBlock | LineBlock | SpacerBlock)[] };
  blocks: Block[];
  watermark: { enabled: boolean; text: string; color: string; opacity: number; size: number; angle: number };
  /** disable copying / editing in PDF viewers (open with no password) */
  lockEditing: boolean;
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export const BLOCK_LABEL: Record<BlockType, string> = {
  text: 'ข้อความ', image: 'รูปภาพ', line: 'เส้นคั่น', spacer: 'ช่องว่าง', pageBreak: 'ขึ้นหน้าใหม่', columns: 'แถวหลายคอลัมน์', table: 'ตาราง', fields: 'ฟิลด์ข้อมูลของแถว',
};

export const TOKENS: { token: string; label: string }[] = [
  { token: '{{page}}', label: 'เลขหน้า' }, { token: '{{pages}}', label: 'จำนวนหน้าทั้งหมด' }, { token: '{{date}}', label: 'วันที่พิมพ์ (ค.ศ.)' },
  { token: '{{dateBE}}', label: 'วันที่พิมพ์ (พ.ศ.)' }, { token: '{{time}}', label: 'เวลา' }, { token: '{{file}}', label: 'ชื่อไฟล์' },
  { token: '{{sheet}}', label: 'ชื่อชีต' }, { token: '{{user}}', label: 'ผู้พิมพ์' }, { token: '{{rows}}', label: 'จำนวนแถวในตาราง' },
];

export function newTextBlock(text = 'ข้อความ', style: TextStyle = {}): TextBlock {
  return { id: uid(), type: 'text', text, style: { align: 'left', ...style }, marginBottom: 2 };
}

export function newBlock(type: BlockType, sheet?: { id: string; name: string; columns: Column[] } | null): Block {
  const id = uid();
  switch (type) {
    case 'text': return newTextBlock();
    case 'image': return { id, type, source: 'static', url: '', widthMm: 40, heightMm: null, align: 'left', marginBottom: 2 };
    case 'line': return { id, type, thickness: 0.8, color: '#9CA3AF', widthPct: 100, marginTop: 1, marginBottom: 3 };
    case 'spacer': return { id, type, height: 6 };
    case 'pageBreak': return { id, type };
    case 'columns': return { id, type, gap: 4, cols: [{ widthPct: 50, blocks: [newTextBlock('ซ้าย')] }, { widthPct: 50, blocks: [newTextBlock('ขวา', { align: 'right' })] }], marginBottom: 2 };
    case 'fields': return { id, type, columns: (sheet?.columns ?? []).map((c) => ({ columnId: c.id, columnName: c.name })), perRow: 2, label: { fontSize: 9, color: '#6B7280', bold: true }, value: { fontSize: 11 }, border: { color: '#E5E7EB', width: 0.5 }, imageSizeMm: 30, marginBottom: 3 };
    case 'table':
      return {
        id, type, sheetId: sheet?.id ?? '', sheetName: sheet?.name ?? '', columns: (sheet?.columns ?? []).filter((c) => c.dataType !== 'image').slice(0, 8).map((c) => ({ columnId: c.id, columnName: c.name })),
        rowsPerPage: null, limit: null, widthPct: 100, align: 'left',
        header: { bg: '#1552F0', color: '#FFFFFF', bold: true, fontSize: 10, align: 'left' },
        body: { fontSize: 9.5, color: '#111827', zebra: '#F3F4F6', lineHeight: 1.15 }, border: { color: '#D1D5DB', width: 0.5 }, padding: 3,
        showRowNumber: true, rowNumberHeader: '#', repeatHeader: true, useCurrentFilters: true, imageSizeMm: 18, maxImagesPerCell: 3,
        summary: [], summaryLabel: 'รวม', marginBottom: 3,
      };
  }
}

export function newTemplate(name: string, mode: 'table' | 'perRow' = 'table'): PdfTemplate {
  return {
    id: uid(), name, mode,
    page: { size: 'A4', orientation: 'portrait', margins: { top: 18, right: 12, bottom: 16, left: 12 } },
    base: { font: 'Sarabun', fontSize: 11, color: '#111827' },
    header: { enabled: false, blocks: [] },
    footer: { enabled: true, blocks: [newTextBlock('{{file}} · {{sheet}}   หน้า {{page}} / {{pages}}', { fontSize: 8, color: '#6B7280', align: 'right' })] },
    blocks: [],
    watermark: { enabled: false, text: 'ลับ', color: '#9CA3AF', opacity: 0.15, size: 90, angle: -35 },
    lockEditing: false,
  };
}

/** A ready-to-use report for a sheet (used when the file has no layout yet) */
export function defaultTemplate(fileName: string, sheet: { id: string; name: string; columns: Column[] }): PdfTemplate {
  const t = newTemplate('รายงานมาตรฐาน');
  const cols = sheet.columns.filter((c) => c.dataType !== 'image');
  t.page.orientation = cols.length > 6 ? 'landscape' : 'portrait';
  const title = newTextBlock(fileName, { fontSize: 18, bold: true, color: '#1552F0' });
  const sub = newTextBlock('ชีต: {{sheet}} · พิมพ์เมื่อ {{date}} {{time}} · โดย {{user}} · {{rows}} แถว', { fontSize: 9, color: '#6B7280' });
  sub.marginBottom = 4;
  const table = newBlock('table', sheet) as TableBlock;
  table.columns = cols.map((c) => ({ columnId: c.id, columnName: c.name }));
  t.blocks = [title, sub, table];
  return t;
}
