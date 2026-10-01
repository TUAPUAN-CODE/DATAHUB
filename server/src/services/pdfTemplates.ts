import crypto from 'crypto';
import { q } from '../config/db';
import { safeJson } from '../shared/http';

/**
 * PDF export layouts live on the file (Files.pdf_templates, a JSON array). The client owns the structure; the server
 * only stores it, copies it with the file and re-points table blocks to the sheets of the destination file.
 * A table block keeps `sheetId` plus `sheetName`; on copy the sheet is matched by name, then by position.
 */
export type PdfTemplate = { id: string; name: string; [k: string]: unknown };

const uid = () => crypto.randomUUID();

export function parseTemplates(raw: string | null | undefined): PdfTemplate[] {
  const v = safeJson<unknown>(raw ?? null, []);
  return Array.isArray(v) ? (v.filter((t) => t && typeof t === 'object' && typeof (t as PdfTemplate).id === 'string') as PdfTemplate[]) : [];
}

interface SheetRef { sheet_id: string; sheet_name: string }

export function remapTemplates(templates: PdfTemplate[], from: SheetRef[], to: SheetRef[], fresh = true): PdfTemplate[] {
  const pick = (id: unknown, name: unknown): string | null => {
    const byId = from.findIndex((s) => s.sheet_id === id);
    const nm = typeof name === 'string' && name ? name : byId >= 0 ? from[byId].sheet_name : null;
    const byName = nm ? to.find((s) => s.sheet_name.trim().toLowerCase() === nm.trim().toLowerCase()) : undefined;
    return (byName ?? (byId >= 0 ? to[byId] : undefined) ?? to[0])?.sheet_id ?? null;
  };
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const o = { ...(node as Record<string, unknown>) };
      for (const k of Object.keys(o)) o[k] = walk(o[k]);
      if ('sheetId' in o) {
        const nid = pick(o.sheetId, o.sheetName);
        o.sheetId = nid;
        const t = to.find((s) => s.sheet_id === nid);
        if (t) o.sheetName = t.sheet_name;
        // column ids differ in the copy: the client re-maps them by column name (see `columnName` in each table column)
      }
      return o;
    }
    return node;
  };
  return templates.map((t) => ({ ...(walk(t) as PdfTemplate), ...(fresh ? { id: uid() } : {}) }));
}

export async function sheetsOfFile(fileId: string, tx?: Parameters<typeof q>[2]): Promise<SheetRef[]> {
  return (await q(`SELECT sheet_id, sheet_name FROM Sheets WHERE file_id = @f AND is_deleted = 0 ORDER BY sort_order`, { f: fileId }, tx)) as SheetRef[];
}
