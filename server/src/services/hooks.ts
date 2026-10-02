import type { Tx } from '../config/db';
import type { AuthUser } from '../middleware/auth';
import type { CellValue } from '../shared/cellValue';

/**
 * Extension points that let independent modules (formula columns, archives, …) plug into the core
 * without the core importing them. A module registers itself once (see server/src/modules/*) and the
 * core simply calls `run…` at the matching moment. Removing a module = removing its registration line.
 */
export interface ColumnLike { column_id: string; column_name: string; data_type: string; validation: Record<string, any> }

/** A cell written by a module as a side effect of the user's edit (reported back like a normal edit) */
export interface ExtraWrite {
  rowId: string; columnId: string; rowNo: number; columnName: string;
  oldValue: CellValue; newValue: CellValue; historyId: number | null; at: Date | null;
}

export interface CellsWrittenCtx {
  tx: Tx; user: AuthUser; sheetId: string; rowIds: string[]; source: string;
}

type ColumnGuard = (col: ColumnLike, source: string) => string | null;
type AfterCellsWritten = (ctx: CellsWrittenCtx) => Promise<ExtraWrite[]>;

export interface SheetCopiedCtx { tx: Tx; oldSheetId: string; newSheetId: string; columnMap: { old_id: string; new_id: string }[] }
type AfterSheetCopied = (ctx: SheetCopiedCtx) => Promise<void>;

const guards: ColumnGuard[] = [];
const afterCopies: AfterSheetCopied[] = [];
const afterWrites: AfterCellsWritten[] = [];

/** Return a message to refuse a user write to this column, or null to allow it */
export const registerColumnGuard = (fn: ColumnGuard) => { guards.push(fn); };
export const columnWriteBlockedReason = (col: ColumnLike, source: string): string | null => {
  for (const g of guards) { const r = g(col, source); if (r) return r; }
  return null;
};

/** Runs inside the same transaction as the user's write, after the user's cells are written */
export const registerAfterCellsWritten = (fn: AfterCellsWritten) => { afterWrites.push(fn); };
export async function runAfterCellsWritten(ctx: CellsWrittenCtx): Promise<ExtraWrite[]> {
  const out: ExtraWrite[] = [];
  for (const fn of afterWrites) out.push(...(await fn(ctx)));
  return out;
}

/** After a sheet (and its columns) was copied — modules re-point references that contain column ids */
export const registerAfterSheetCopied = (fn: AfterSheetCopied) => { afterCopies.push(fn); };
export async function runAfterSheetCopied(ctx: SheetCopiedCtx): Promise<void> { for (const fn of afterCopies) await fn(ctx); }

/** Lets a module add display-only data to the columns of a sheet before they are sent to a manager's editor */
export interface DecorateColumnsCtx { user: AuthUser; sheetId: string; columns: { id: string; validation: Record<string, any> }[] }
type ColumnDecorator = (ctx: DecorateColumnsCtx) => Promise<void>;
const decorators: ColumnDecorator[] = [];
export const registerColumnDecorator = (fn: ColumnDecorator) => { decorators.push(fn); };
export async function runColumnDecorators(ctx: DecorateColumnsCtx): Promise<void> { for (const fn of decorators) await fn(ctx); }
