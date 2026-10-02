import { q1, T } from '../config/db';

/** First (lowest row number) live row whose cell in `column` equals `value` (text: case-insensitive; numbers: numeric) */
export async function findRowByValue(sheetId: string, column: { column_id: string; data_type: string }, value: string): Promise<{ rowId: string; rowNo: number } | null> {
  const t = column.data_type;
  const isNum = t === 'int' || t === 'float';
  const num = Number(value.replace(/,/g, ''));
  if (isNum && !Number.isFinite(num)) return null;
  const cond = t === 'int' ? 'c.value_int = @n' : t === 'float' ? 'ABS(c.value_float - @n) < 0.0000001' : 'c.value_text = @v';
  const r = await q1(
    `SELECT TOP 1 r.row_id, r.row_order FROM Rows r JOIN Cells c ON c.row_id = r.row_id AND c.column_id = @c
     WHERE r.sheet_id = @s AND r.is_deleted = 0 AND ${cond} ORDER BY r.row_order`,
    { s: T.uuid(sheetId), c: T.uuid(column.column_id), v: T.text(value), n: isNum ? T.float(num) : T.float(0) });
  return r ? { rowId: r.row_id as string, rowNo: Number(r.row_order) } : null;
}
