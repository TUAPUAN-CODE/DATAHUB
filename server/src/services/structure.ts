import { q1, T, Tx } from '../config/db';
import { badRequest } from '../shared/http';
import { checkColumnInput, ColumnInput } from '../shared/schemas';

/** Inserts a column definition (validated) and returns the new row */
export async function insertColumn(tx: Tx, sheetId: string, input: ColumnInput, order: number, userId: string) {
  const checked = checkColumnInput(input);
  return q1(
    `INSERT INTO Columns (sheet_id, column_name, data_type, display_order, width, is_required, default_value, placeholder,
        validation_rule, select_options, description, created_by)
     OUTPUT inserted.*
     VALUES (@s, @n, @t, @o, @w, @r, @dv, @ph, @vr, @so, @d, @u)`,
    {
      s: T.uuid(sheetId),
      n: input.name,
      t: input.dataType,
      o: T.int(order),
      w: T.int(input.width ?? 160),
      r: T.bit(!!input.isRequired),
      dv: T.text(checked.defaultValue === null ? null : JSON.stringify(checked.defaultValue)),
      ph: T.text(input.placeholder ?? null),
      vr: T.text(checked.validation ? JSON.stringify(checked.validation) : null),
      so: T.text(checked.options ? JSON.stringify(checked.options) : null),
      d: T.text(input.description ?? null),
      u: T.uuid(userId),
    },
    tx,
  );
}

export function assertUniqueNames(names: string[], what = 'คอลัมน์') {
  const seen = new Set<string>();
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (seen.has(k)) throw badRequest(`ชื่อ${what} "${n}" ซ้ำกัน`);
    seen.add(k);
  }
}
