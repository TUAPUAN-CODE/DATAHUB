import type { Column, DataType, Validation } from '@/types';

/** Column types a formula can produce (same list as the server) */
export const FORMULA_TYPES: DataType[] = ['varchar', 'text', 'int', 'float', 'date', 'datetime', 'boolean'];
export const canHaveFormula = (t: DataType) => FORMULA_TYPES.includes(t);

const esc = (n: string) => n.replace(/\]/g, ']]');

/** Stored form ([#column-id]) → what the user reads and edits ([Column name]) */
export function canonicalToDisplay(expr: string, cols: { id?: string; name: string }[]): string {
  const byId = new Map(cols.filter((c) => c.id).map((c) => [c.id!.toLowerCase(), c.name]));
  return expr.replace(/\[#([0-9a-fA-F-]{36})\]/g, (_m, id: string) => `[${esc(byId.get(id.toLowerCase()) ?? '?')}]`);
}

/** Validation of a saved column, with the formula shown by names (used when the editor opens).
 *  The server already wrote the readable form (also for @source[...]) in `col.formula` for managers. */
export function validationForEditor(col: Pick<Column, 'validation' | 'formula'>, all: Column[]): Validation {
  const base = { ...(col.validation ?? {}) };
  if (base.formula?.expr) {
    const sources = (base.formula.sources ?? []).map((s) => ({ ...s, ...(col.formula?.sources.find((x) => x.alias === s.alias) ?? {}) }));
    base.formula = { expr: col.formula?.display ?? canonicalToDisplay(base.formula.expr, all), ...(sources.length ? { sources } : {}) };
  }
  return base;
}
