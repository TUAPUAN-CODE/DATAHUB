import { Router } from 'express';
import { z } from 'zod';
import { q, q1, T, withTx } from '../config/db';
import { audit } from '../shared/audit';
import { anyStoredValue, ColumnDef, fromStorage, normalizeValue, DataType } from '../shared/cellValue';
import { ah, badRequest, conflict, notFound, ok, parse, pid, zId } from '../shared/http';
import { mapColumn } from '../shared/mappers';
import { LV, requireSheet } from '../shared/permissions';
import { checkColumnInput, columnInput } from '../shared/schemas';
import { writeCell } from '../services/cellWriter';
import { insertColumn } from '../services/structure';
import { assertLookupConfig, Lookup } from '../services/lookup';
import { emitToSheet } from '../socket';

const router = Router();

async function getColumn(id: string) {
  const col = await q1(`SELECT * FROM Columns WHERE column_id = @id`, { id: T.uuid(id) });
  if (!col) throw notFound('ไม่พบคอลัมน์');
  return col;
}

async function nameTaken(sheetId: string, name: string, exceptId?: string) {
  const r = await q1(
    `SELECT 1 AS x FROM Columns WHERE sheet_id = @s AND is_deleted = 0 AND column_name = @n ${exceptId ? 'AND column_id <> @id' : ''}`,
    { s: T.uuid(sheetId), n: name, id: T.uuid(exceptId ?? null) },
  );
  return !!r;
}

router.post(
  '/sheets/:id/columns',
  ah(async (req, res) => {
    const sheetId = pid(req);
    const { sheet } = await requireSheet(req.user!, sheetId, LV.manage);
    const body = parse(columnInput.extend({ insertAt: z.number().int().min(0).optional() }), req.body);
    if ((body.dataType === 'select' || body.dataType === 'multi_select') && body.validation?.lookup) await assertLookupConfig(req.user!, sheetId, null, body.validation.lookup as Lookup);
    if (await nameTaken(sheetId, body.name)) throw conflict(`มีคอลัมน์ชื่อ "${body.name}" อยู่แล้ว`);
    const row = await withTx(async (tx) => {
      let order: number;
      if (body.insertAt !== undefined) {
        await q(`UPDATE Columns SET display_order = display_order + 1 WHERE sheet_id = @s AND display_order >= @o`, { s: T.uuid(sheetId), o: T.int(body.insertAt) }, tx);
        order = body.insertAt;
      } else {
        const o = await q1(`SELECT ISNULL(MAX(display_order), -1) + 1 AS o FROM Columns WHERE sheet_id = @s`, { s: T.uuid(sheetId) }, tx);
        order = o!.o;
      }
      const c = await insertColumn(tx, sheetId, body, order, req.user!.id);
      await audit({ userId: req.user!.id, action: 'column_create', entityType: 'column', entityId: c!.column_id, fileId: sheet.file_id, sheetId,
        newValue: { name: body.name, dataType: body.dataType, isRequired: body.isRequired } }, req, tx);
      return c;
    });
    emitToSheet(sheetId, 'columns:changed', { sheetId });
    ok(res, mapColumn(row), 201);
  }),
);

/** Converts a stored value to something the new type's parser understands */
function toRawForConversion(v: unknown, fromType: DataType): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.join(', ');
  if (fromType === 'boolean') return v ? 'true' : 'false';
  return v;
}

router.put(
  '/columns/:id',
  ah(async (req, res) => {
    const id = pid(req);
    const before = await getColumn(id);
    if (before.is_deleted) throw badRequest('คอลัมน์นี้ถูกลบแล้ว กรุณากู้คืนก่อนแก้ไข');
    const { sheet } = await requireSheet(req.user!, before.sheet_id, LV.manage);
    const body = parse(columnInput.partial().extend({ convert: z.boolean().optional() }), req.body);
    const merged = {
      name: body.name ?? before.column_name,
      dataType: (body.dataType ?? before.data_type) as DataType,
      isRequired: body.isRequired ?? !!before.is_required,
      width: body.width ?? before.width,
      defaultValue: body.defaultValue !== undefined ? body.defaultValue : before.default_value ? JSON.parse(before.default_value) : null,
      placeholder: body.placeholder !== undefined ? body.placeholder : before.placeholder,
      description: body.description !== undefined ? body.description : before.description,
      validation: body.validation !== undefined ? body.validation : before.validation_rule ? JSON.parse(before.validation_rule) : null,
      options: body.options !== undefined ? body.options : before.select_options ? JSON.parse(before.select_options) : null,
    };
    if (merged.name !== before.column_name && (await nameTaken(before.sheet_id, merged.name, id)))
      throw conflict(`มีคอลัมน์ชื่อ "${merged.name}" อยู่แล้ว`);
    if ((merged.dataType === 'select' || merged.dataType === 'multi_select') && (merged.validation as any)?.lookup)
      await assertLookupConfig(req.user!, before.sheet_id, id, (merged.validation as any).lookup as Lookup);
    const checked = checkColumnInput(merged as any);
    const typeChanged = merged.dataType !== before.data_type;

    let conversion: { converted: number; cleared: number } | null = null;
    if (typeChanged) {
      const count = await q1(`SELECT COUNT(*) AS n FROM Cells c JOIN Rows r ON r.row_id = c.row_id
        WHERE c.column_id = @c AND r.is_deleted = 0`, { c: T.uuid(id) });
      if (Number(count?.n) > 0 && !body.convert)
        throw conflict(`คอลัมน์นี้มีข้อมูล ${Number(count?.n).toLocaleString()} เซลล์ การเปลี่ยนชนิดข้อมูลจะแปลงค่าที่มีอยู่ ค่าที่แปลงไม่ได้จะถูกล้าง`,
          'NEEDS_CONVERSION', { cells: Number(count?.n) });
    }

    await withTx(async (tx) => {
      await q(
        `UPDATE Columns SET column_name = @n, data_type = @t, is_required = @r, width = @w, default_value = @dv, placeholder = @ph,
           description = @d, validation_rule = @vr, select_options = @so, updated_at = SYSUTCDATETIME() WHERE column_id = @id`,
        {
          n: merged.name, t: merged.dataType, r: T.bit(merged.isRequired), w: T.int(merged.width),
          dv: T.text(checked.defaultValue === null ? null : JSON.stringify(checked.defaultValue)),
          ph: T.text(merged.placeholder ?? null), d: T.text(merged.description ?? null),
          vr: T.text(checked.validation ? JSON.stringify(checked.validation) : null),
          so: T.text(checked.options ? JSON.stringify(checked.options) : null), id: T.uuid(id),
        },
        tx,
      );
      if (typeChanged) {
        const newDef: ColumnDef = {
          column_id: id, column_name: merged.name, data_type: merged.dataType, is_required: false,
          validation: checked.validation ?? {}, options: checked.options ?? [],
        };
        const cells = await q(`SELECT c.* FROM Cells c JOIN Rows r ON r.row_id = c.row_id WHERE c.column_id = @c AND r.is_deleted = 0`, { c: T.uuid(id) }, tx);
        let converted = 0;
        let cleared = 0;
        for (const c of cells) {
          const oldVal = fromStorage(before.data_type, c) ?? anyStoredValue(c);
          const n = normalizeValue(newDef, toRawForConversion(oldVal, before.data_type), { skipRequired: true });
          const value = n.ok ? n.value : null;
          if (value === null && oldVal !== null) cleared++;
          else converted++;
          await writeCell(tx, { sheetId: before.sheet_id, rowId: c.row_id, col: newDef, value, userId: req.user!.id, source: 'type_change', readType: before.data_type });
        }
        conversion = { converted, cleared };
      }
      await audit({ userId: req.user!.id, action: 'column_update', entityType: 'column', entityId: id, fileId: sheet.file_id, sheetId: before.sheet_id,
        oldValue: mapColumn(before), newValue: { ...merged, conversion } }, req, tx);
    });
    emitToSheet(before.sheet_id, 'columns:changed', { sheetId: before.sheet_id });
    ok(res, { column: mapColumn(await getColumn(id)), conversion });
  }),
);

router.post(
  '/sheets/:id/columns/reorder',
  ah(async (req, res) => {
    const sheetId = pid(req);
    await requireSheet(req.user!, sheetId, LV.manage);
    const { ids } = parse(z.object({ ids: z.array(zId).min(1).max(500) }), req.body);
    await withTx(async (tx) => {
      for (const [i, cid] of ids.entries())
        await q(`UPDATE Columns SET display_order = @o WHERE column_id = @c AND sheet_id = @s`, { o: T.int(i), c: T.uuid(cid), s: T.uuid(sheetId) }, tx);
    });
    emitToSheet(sheetId, 'columns:changed', { sheetId });
    ok(res, { reordered: true });
  }),
);

router.delete(
  '/columns/:id',
  ah(async (req, res) => {
    const id = pid(req);
    const col = await getColumn(id);
    const { sheet } = await requireSheet(req.user!, col.sheet_id, LV.manage);
    const remaining = await q1(`SELECT COUNT(*) AS n FROM Columns WHERE sheet_id = @s AND is_deleted = 0`, { s: T.uuid(col.sheet_id) });
    if (Number(remaining?.n) <= 1) throw badRequest('ชีตต้องมีอย่างน้อย 1 คอลัมน์');
    await q(`UPDATE Columns SET is_deleted = 1, deleted_at = SYSUTCDATETIME() WHERE column_id = @id`, { id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'column_delete', entityType: 'column', entityId: id, fileId: sheet.file_id, sheetId: col.sheet_id,
      oldValue: { name: col.column_name, dataType: col.data_type } }, req);
    emitToSheet(col.sheet_id, 'columns:changed', { sheetId: col.sheet_id });
    ok(res, { deleted: true });
  }),
);

router.post(
  '/columns/:id/restore',
  ah(async (req, res) => {
    const id = pid(req);
    const col = await getColumn(id);
    const { sheet } = await requireSheet(req.user!, col.sheet_id, LV.manage);
    if (await nameTaken(col.sheet_id, col.column_name, id)) throw conflict(`มีคอลัมน์ชื่อ "${col.column_name}" อยู่แล้ว กรุณาเปลี่ยนชื่อคอลัมน์นั้นก่อน`);
    await q(`UPDATE Columns SET is_deleted = 0, deleted_at = NULL, updated_at = SYSUTCDATETIME() WHERE column_id = @id`, { id: T.uuid(id) });
    await audit({ userId: req.user!.id, action: 'column_restore', entityType: 'column', entityId: id, fileId: sheet.file_id, sheetId: col.sheet_id,
      newValue: { name: col.column_name } }, req);
    emitToSheet(col.sheet_id, 'columns:changed', { sheetId: col.sheet_id });
    ok(res, mapColumn(await getColumn(id)));
  }),
);

export default router;
