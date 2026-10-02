import { q, T } from '../../config/db';
import { registerAfterSheetCopied } from '../../services/hooks';

/**
 * Colour alerts by "% of the standard time" (validation.alert on any column). The colours are computed in the browser from
 * three columns of the same row, so the only thing the server has to keep right is the column ids when a sheet is copied.
 */
registerAfterSheetCopied(async ({ tx, newSheetId, columnMap }) => {
  const map = new Map(columnMap.map((m) => [m.old_id.toLowerCase(), m.new_id.toLowerCase()]));
  const rows = await q(`SELECT column_id, validation_rule FROM Columns WHERE sheet_id = @s AND validation_rule LIKE N'%"alert"%'`, { s: T.uuid(newSheetId) }, tx);
  for (const r of rows) {
    let v: { alert?: Record<string, string | null> } | null = null;
    try { v = JSON.parse(r.validation_rule); } catch { continue; }
    const a = v?.alert;
    if (!a) continue;
    for (const k of ['startColumnId', 'endColumnId', 'limitColumnId']) if (a[k]) a[k] = map.get(String(a[k]).toLowerCase()) ?? a[k];
    await q(`UPDATE Columns SET validation_rule = @v WHERE column_id = @c`, { v: T.text(JSON.stringify(v)), c: T.uuid(r.column_id) }, tx);
  }
});

export default {};
