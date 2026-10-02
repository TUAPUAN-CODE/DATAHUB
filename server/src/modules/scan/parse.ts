/** Pure parsing of scanned text (QR / barcode / RFID text) by a user-defined format. No database, no framework. */
export interface ScanField { index: number; columnId: string }
export interface ScanMatch { prefix?: string | null; regex?: string | null; fieldCount?: number | null }
export interface ScanProfile {
  id: string; name: string;
  /** separator between the pieces, e.g. "|" — "\t" means a tab; empty = the whole text is one piece */
  delimiter: string;
  match?: ScanMatch | null;
  /** piece number (1 = first) → column */
  fields: ScanField[];
  action: 'create' | 'update';
  /** update: the column used to find the existing row; its piece must be in `fields` */
  keyColumnId?: string | null;
  /** update, row not found: make a new row or refuse */
  onMiss?: 'create' | 'reject' | null;
}

export const splitScan = (text: string, delimiter: string): string[] => {
  const d = delimiter === '\\t' ? '\t' : delimiter;
  const t = text.replace(/[\r\n]+$/g, '');
  return (d ? t.split(d) : [t]).map((s) => s.trim());
};

/** How well a profile fits the text: -1 = does not fit; otherwise the number of criteria it satisfied (0 = no criteria, last resort) */
export function matchScore(text: string, p: ScanProfile): number {
  const m = p.match ?? {};
  const parts = splitScan(text, p.delimiter);
  let score = 0;
  if (m.prefix) { if (!text.trim().toLowerCase().startsWith(m.prefix.toLowerCase())) return -1; score++; }
  if (m.fieldCount) { if (parts.length !== m.fieldCount) return -1; score++; }
  if (m.regex) {
    try { if (m.regex.length > 300 || !new RegExp(m.regex, 'i').test(text)) return -1; } catch { return -1; }
    score++;
  }
  const need = Math.max(0, ...p.fields.map((f) => f.index));
  if (parts.length < need) return -1; // a piece the profile needs is missing
  return score;
}

export function detectProfile(text: string, profiles: ScanProfile[]): ScanProfile | null {
  let best: ScanProfile | null = null;
  let bestScore = -1;
  for (const p of profiles) {
    const s = matchScore(text, p);
    if (s > bestScore) { best = p; bestScore = s; }
  }
  return best;
}

/** column id → text of the piece (empty pieces are skipped) */
export function parseScan(text: string, p: ScanProfile): { pieces: string[]; values: Record<string, string> } {
  const pieces = splitScan(text, p.delimiter);
  const values: Record<string, string> = {};
  for (const f of p.fields) {
    const v = pieces[f.index - 1];
    if (v !== undefined && v !== '') values[f.columnId] = v;
  }
  return { pieces, values };
}
