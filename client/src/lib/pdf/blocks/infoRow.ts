import { fillTokens } from '../variables';
import type { BuildCtx } from '../build';
import { MM } from '../types';
import type { BlockBase, TextStyle } from '../types';

/** A line of "label: value" fields such as  Date: 02/10/2026   Shift: DS   Line: A   Plant: 1  (values accept {{tokens}}) */
export interface InfoItem { id: string; label: string; value: string; widthPct: number }
export interface InfoRowBlock extends BlockBase {
  type: 'infoRow';
  items: InfoItem[];
  labelStyle: TextStyle;
  valueStyle: TextStyle;
  underline: boolean;
  gapMm: number;
  lineColor: string;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'i' + Math.random().toString(36).slice(2));
export const newInfoItem = (label = 'ชื่อฟิลด์', value = ''): InfoItem => ({ id: uid(), label, value, widthPct: 25 });

export const newInfoRow = (): InfoRowBlock => ({
  id: uid(), type: 'infoRow', underline: true, gapMm: 6, lineColor: '#9CA3AF', marginBottom: 3,
  items: [newInfoItem('Date:', '{{date}}'), newInfoItem('Shift:', '{{shift}}'), newInfoItem('Line:', ''), newInfoItem('Plant:', '')],
  labelStyle: { fontSize: 9, bold: true }, valueStyle: { fontSize: 10 },
});

const pt = (mm: number) => mm * MM;

export function buildInfoRow(b: InfoRowBlock, c: BuildCtx) {
  const total = b.items.reduce((s, i) => s + (i.widthPct || 0), 0) || 100;
  const st = (s: TextStyle) => ({ font: s.font ?? c.base.font, fontSize: s.fontSize ?? c.base.fontSize, color: s.color ?? c.base.color, bold: !!s.bold, italics: !!s.italic });
  // the gaps come out of the width the items share, so the row never runs past the page margin
  const margins = pt(b.marginLeft ?? 0) + pt(b.marginRight ?? 0);
  const gaps = Math.max(0, b.items.length - 1) * pt(b.gapMm);
  const room = Math.max(40, c.contentWidth - margins - gaps);
  const widths: number[] = [];
  const row: any[] = [];
  b.items.forEach((it, i) => {
    if (i > 0) { widths.push(pt(b.gapMm)); row.push({ text: '', border: [false, false, false, false] }); }
    widths.push((room * (it.widthPct || 0)) / total);
    const val = fillTokens(it.value, c.vars, c.rowVars);
    row.push({ text: [{ text: `${it.label} `, ...st(b.labelStyle) }, { text: val || ' ', ...st(b.valueStyle) }], border: [false, false, false, b.underline] });
  });
  return {
    table: { widths, body: [row] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => b.lineColor, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 1, paddingBottom: () => 1 },
    margin: [pt(b.marginLeft ?? 0), pt(b.marginTop ?? 0), pt(b.marginRight ?? 0), pt(b.marginBottom ?? 0)],
  };
}
