import { registerAfterCellsWritten, registerAfterSheetCopied, registerColumnGuard } from '../../services/hooks';
import router from './routes';
import { formulaExprOf, recomputeRows, remapAfterCopy } from './service';

/**
 * Formula columns: a normal typed column whose cells are computed from the other cells of the row.
 * The result is stored in Cells like any value, so sorting, filtering, dashboards and exports work unchanged.
 * Everything the module needs from the core goes through services/hooks.ts.
 */
registerColumnGuard((col) => (formulaExprOf(col) ? 'คอลัมน์นี้คำนวณจากสูตรอัตโนมัติ แก้ไขเองไม่ได้' : null));
registerAfterCellsWritten(async (ctx) => (ctx.source === 'formula' ? [] : recomputeRows(ctx.tx, ctx.sheetId, ctx.rowIds, ctx.user.id)));
registerAfterSheetCopied(({ tx, newSheetId, columnMap }) => remapAfterCopy(tx, newSheetId, columnMap));

export default { router };
