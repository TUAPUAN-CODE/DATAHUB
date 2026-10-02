import { registerAfterCellsWritten, registerAfterSheetCopied, registerColumnDecorator, registerColumnGuard } from '../../services/hooks';
import router from './routes';
import { describeFormula, formulaExprOf, recomputeRows, remapAfterCopy, scheduleReaders } from './service';
import { loadColumns } from '../../services/cellWriter';

/**
 * Formula columns: a normal typed column whose cells are computed from the other cells of the row.
 * The result is stored in Cells like any value, so sorting, filtering, dashboards and exports work unchanged.
 * Everything the module needs from the core goes through services/hooks.ts.
 */
registerColumnGuard((col) => (formulaExprOf(col) ? 'คอลัมน์นี้คำนวณจากสูตรอัตโนมัติ แก้ไขเองไม่ได้' : null));
registerAfterCellsWritten(async (ctx) => {
  scheduleReaders(ctx.user, ctx.sheetId); // sheets that read this one through LOOKUP are recalculated shortly after
  return ctx.source === 'formula' ? [] : recomputeRows(ctx.tx, ctx.sheetId, ctx.rowIds, ctx.user.id);
});
// managers get the readable formula and the names of the files/sheets it reads
registerColumnDecorator(async ({ columns, sheetId }) => {
  const cols = await loadColumns(sheetId);
  for (const out of columns as any[]) {
    const src = cols.find((c) => c.column_id === out.id || c.column_id === out.columnId);
    if (!src || !formulaExprOf({ data_type: src.data_type, validation: out.validation })) continue;
    const d = await describeFormula({ ...src, validation: out.validation }, cols);
    if (d) out.formula = d;
  }
});
registerAfterSheetCopied(({ tx, newSheetId, columnMap }) => remapAfterCopy(tx, newSheetId, columnMap));

export default { router };
