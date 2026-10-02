import { idList, jsonParam, q, T, Tx, withTx } from '../../config/db';
import { env } from '../../config/env';
import { AuthUser } from '../../middleware/auth';
import { CellValue, ColumnDef, DataType, fromStorage, normalizeValue, toColumnDef } from '../../shared/cellValue';
import { badRequest } from '../../shared/http';
import { logger } from '../../shared/logger';
import { ExtraWrite } from '../../services/hooks';
import { loadColumns, writeCell } from '../../services/cellWriter';
import { emitToSheet } from '../../socket';
import { ColumnRef, compileFormula, displayFormula, topoOrder } from './compile';
import { evaluate } from './evaluator';
import { toBool, toDate, toNumber, toText, parts } from './convert';
import { DateV, FormulaSyntaxError, FValue, isDateV, Node } from './types';
import { parse } from './parser';

/** Column types a formula may produce (the result is stored exactly like a typed value of that column) */
export const FORMULA_TYPES = new Set<string>(['varchar', 'text', 'int', 'float', 'date', 'datetime', 'boolean']);

export const formulaExprOf = (col: { data_type: string; validation?: Record<string, any> | null }): string | null => {
  const e = (col.validation as { formula?: { expr?: string } } | null | undefined)?.formula?.expr;
  return e && FORMULA_TYPES.has(col.data_type) ? e : null;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** stored cell value → formula value */
export function toF(type: DataType | string, v: CellValue): FValue {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return type === 'multi_select' ? v.join(', ') : null;
  if (type === 'date' && typeof v === 'string') return toDate(v) ? ({ kind: 'date', ms: toDate(v)!.ms } as DateV) : null;
  if (type === 'datetime' && typeof v === 'string') { const ms = Date.parse(v); return Number.isNaN(ms) ? null : ({ kind: 'datetime', ms } as DateV); }
  return v as FValue;
}

/** formula result → raw value for the column's own normalizer */
export function fromF(result: FValue, type: DataType | string): unknown {
  if (result === null) return null;
  const tz = env.tzOffsetMinutes;
  if (isDateV(result)) {
    const p = parts(result, { tzOffsetMinutes: tz });
    switch (type) {
      case 'date': return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
      case 'datetime': return new Date(result.ms - (result.kind === 'date' ? tz * 60_000 : 0)).toISOString();
      case 'varchar': case 'text': return result.kind === 'date' ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : `${p.y}-${pad2(p.m)}-${pad2(p.d)} ${pad2(p.h)}:${pad2(p.mi)}`;
      default: return toNumber(result);
    }
  }
  switch (type) {
    case 'int': { const n = toNumber(result); return n === null ? null : Math.round(n); }
    case 'float': return toNumber(result);
    case 'boolean': return toBool(result);
    case 'date': case 'datetime': { const d = toDate(result); return d ? fromF(d, type) : null; }
    default: return toText(result);
  }
}

interface PlanItem { id: string; def: ColumnDef; ast: Node; deps: string[] }
export interface Plan { items: PlanItem[]; types: Map<string, DataType>; defs: Map<string, ColumnDef>; needed: string[] }

const refsOf = (cols: any[]): ColumnRef[] => cols.map((c) => ({ id: c.column_id, name: c.column_name, dataType: c.data_type }));

/** Formula columns of a sheet in the order they have to be computed. Broken formulas (deleted source column …) are skipped. */
export async function planSheet(sheetId: string, tx?: Tx | null): Promise<Plan> {
  const cols = await loadColumns(sheetId, tx);
  const defs = new Map(cols.map((c) => [c.column_id, toColumnDef(c)]));
  const refs = refsOf(cols);
  const found: PlanItem[] = [];
  for (const c of cols) {
    const def = defs.get(c.column_id)!;
    const expr = formulaExprOf(def);
    if (!expr) continue;
    try {
      const compiled = compileFormula(expr, refs, { selfId: c.column_id });
      found.push({ id: c.column_id, def, ast: compiled.ast, deps: compiled.deps });
    } catch (e) {
      logger.warn(`Formula skipped (${def.column_name}): ${(e as Error).message}`);
    }
  }
  let ordered: string[];
  try { ordered = topoOrder(found); } catch { logger.warn(`Formula cycle in sheet ${sheetId}`); return { items: [], types: new Map(), defs, needed: [] }; }
  const byId = new Map(found.map((f) => [f.id, f]));
  const items = ordered.map((id) => byId.get(id)!);
  const needed = [...new Set(items.flatMap((i) => i.deps))];
  return { items, types: new Map(cols.map((c) => [c.column_id, c.data_type])), defs, needed };
}

/** Recomputes every formula column for the given rows and writes the changes (same transaction as the caller). */
export async function recomputeRows(tx: Tx, sheetId: string, rowIds: string[], userId: string, preset?: Plan): Promise<ExtraWrite[]> {
  const plan = preset ?? (await planSheet(sheetId, tx));
  if (!plan.items.length || !rowIds.length) return [];
  const ids = [...new Set(rowIds.map((r) => r.toLowerCase()))];
  const cells = await q(
    `SELECT row_id, column_id, value_text, value_int, value_float, value_date, value_bool, value_json FROM Cells
     WHERE row_id IN ${idList('@ids')} AND column_id IN ${idList('@cc')}`,
    { ids: jsonParam(ids), cc: jsonParam(plan.needed) },
    tx,
  );
  const rows = await q(`SELECT row_id, row_order FROM Rows WHERE row_id IN ${idList('@ids')} AND is_deleted = 0`, { ids: jsonParam(ids) }, tx);
  const rowNo = new Map(rows.map((r) => [r.row_id, r.row_order]));
  const vals = new Map<string, Map<string, FValue>>();
  for (const c of cells) {
    const t = plan.types.get(c.column_id);
    if (!t) continue;
    if (!vals.has(c.row_id)) vals.set(c.row_id, new Map());
    vals.get(c.row_id)!.set(c.column_id, toF(t, fromStorage(t as DataType, c)));
  }

  const out: ExtraWrite[] = [];
  for (const rowId of ids) {
    if (!rowNo.has(rowId)) continue;
    const cur = vals.get(rowId) ?? new Map<string, FValue>();
    for (const it of plan.items) {
      let result: FValue = null;
      try { result = evaluate(it.ast, { get: (id) => cur.get(id) ?? null, tzOffsetMinutes: env.tzOffsetMinutes }); } catch { result = null; }
      const n = normalizeValue(it.def, fromF(result, it.def.data_type), { skipRequired: true });
      const value: CellValue = n.ok ? n.value : null;
      cur.set(it.id, toF(it.def.data_type, value)); // dependents see the stored (rounded / typed) value
      const w = await writeCell(tx, { sheetId, rowId, col: it.def, value, userId, source: 'formula' });
      if (w.changed) out.push({ rowId, columnId: it.id, rowNo: rowNo.get(rowId), columnName: it.def.column_name, oldValue: w.oldValue, newValue: w.newValue, historyId: w.historyId, at: w.at } as ExtraWrite);
    }
  }
  return out;
}

const CHUNK = 400;
export const SYNC_LIMIT_ROWS = 20_000;

/** Recomputes all formula columns of a sheet for every row (after a formula is created / changed) */
export async function recomputeSheet(user: AuthUser, sheetId: string): Promise<{ rows: number; cellsChanged: number }> {
  const plan = await planSheet(sheetId);
  if (!plan.items.length) return { rows: 0, cellsChanged: 0 };
  const all = await q(`SELECT row_id FROM Rows WHERE sheet_id = @s AND is_deleted = 0 ORDER BY row_order`, { s: T.uuid(sheetId) });
  let changed = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK).map((r) => r.row_id as string);
    changed += await withTx(async (tx) => (await recomputeRows(tx, sheetId, chunk, user.id, plan)).length);
  }
  emitToSheet(sheetId, 'rows:changed', { sheetId, action: 'formula', by: user.displayName });
  return { rows: all.length, cellsChanged: changed };
}

/** After a formula column was created / changed: fill existing rows (in the background when the sheet is large) */
export async function backfill(user: AuthUser, sheetId: string): Promise<{ queued: boolean }> {
  if ((await countRows(sheetId)) > SYNC_LIMIT_ROWS) {
    void recomputeSheet(user, sheetId).catch((e) => logger.error(`formula backfill failed: ${e?.message}`));
    return { queued: true };
  }
  await recomputeSheet(user, sheetId);
  return { queued: false };
}

/** A copied sheet has new column ids: re-point the formulas of its columns */
export async function remapAfterCopy(tx: Tx, newSheetId: string, columnMap: { old_id: string; new_id: string }[]): Promise<void> {
  const map = new Map(columnMap.map((m) => [m.old_id.toLowerCase(), m.new_id.toLowerCase()]));
  const rows = await q(`SELECT column_id, validation_rule FROM Columns WHERE sheet_id = @s AND validation_rule LIKE N'%formula%'`, { s: T.uuid(newSheetId) }, tx);
  for (const r of rows) {
    let v: { formula?: { expr?: string } } | null = null;
    try { v = JSON.parse(r.validation_rule); } catch { continue; }
    const expr = v?.formula?.expr;
    if (!expr) continue;
    v!.formula!.expr = expr.replace(/\[#([0-9a-fA-F-]{36})\]/g, (_m, id: string) => `[#${map.get(id.toLowerCase()) ?? id.toLowerCase()}]`);
    await q(`UPDATE Columns SET validation_rule = @v WHERE column_id = @c`, { v: T.text(JSON.stringify(v)), c: T.uuid(r.column_id) }, tx);
  }
}

export async function countRows(sheetId: string): Promise<number> {
  const r = await q(`SELECT COUNT(*) AS n FROM Rows WHERE sheet_id = @s AND is_deleted = 0`, { s: T.uuid(sheetId) });
  return Number(r[0]?.n ?? 0);
}

/** Validates a formula column definition; returns the validation to store (expression kept by column id) */
export async function prepareFormulaValidation(
  sheetId: string,
  selfId: string | null,
  dataType: string,
  validation: Record<string, any> | null | undefined,
): Promise<Record<string, any> | null | undefined> {
  const raw = validation?.formula?.expr as string | undefined;
  if (validation && 'formula' in validation && !raw) { const { formula: _f, ...rest } = validation; void _f; return Object.keys(rest).length ? rest : null; }
  if (!raw) return validation;
  if (!FORMULA_TYPES.has(dataType)) throw badRequest('สูตรใช้ได้กับคอลัมน์ชนิด ข้อความ ตัวเลข วันที่ และ ใช่/ไม่ใช่ เท่านั้น');
  const cols = await loadColumns(sheetId);
  const refs = refsOf(cols.filter((c) => c.column_id !== selfId));
  let compiled;
  try { compiled = compileFormula(raw, refs, { selfId: selfId ?? undefined }); } catch (e) {
    if (e instanceof FormulaSyntaxError) throw badRequest(`สูตรไม่ถูกต้อง: ${e.message}`, { formula: { message: e.message, pos: e.pos } });
    throw e;
  }
  // cycle check including the column being saved
  const others: { id: string; deps: string[] }[] = [];
  for (const c of cols) {
    if (c.column_id === selfId) continue;
    const ex = formulaExprOf(toColumnDef(c));
    if (!ex) continue;
    try { others.push({ id: c.column_id, deps: compileFormula(ex, refsOf(cols), { selfId: c.column_id }).deps }); } catch { /* broken elsewhere */ }
  }
  const selfKey = selfId ?? '__new__';
  try { topoOrder([...others, { id: selfKey, deps: compiled.deps }]); } catch { throw badRequest('สูตรนี้ทำให้คอลัมน์สูตรอ้างอิงกันเป็นวงกลม'); }
  return { ...validation, formula: { expr: compiled.canonical } };
}

/** Names of formula columns that use `columnId` (a column used by a formula cannot be deleted) */
export async function formulaDependents(sheetId: string, columnId: string): Promise<string[]> {
  const cols = await loadColumns(sheetId);
  const refs = refsOf(cols);
  const names: string[] = [];
  for (const c of cols) {
    const ex = formulaExprOf(toColumnDef(c));
    if (!ex || c.column_id === columnId) continue;
    try { if (compileFormula(ex, refs).deps.includes(columnId)) names.push(c.column_name); } catch { /* ignore */ }
  }
  return names;
}

/** For the column editor: shows the stored formula with column names */
export const formulaDisplay = (canonical: string, cols: any[]) => displayFormula(canonical, refsOf(cols));

export { parse as parseFormula };
