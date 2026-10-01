import { z } from 'zod';
import { DATA_TYPES, normalizeValue, ColumnDef, SelectOption } from './cellValue';
import { badRequest, zColor, zId } from './http';

export const optionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  color: z.string().max(20).nullish(),
});

export const validationSchema = z
  .object({
    min: z.number().nullish(),
    max: z.number().nullish(),
    decimals: z.number().int().min(0).max(10).nullish(),
    maxLength: z.number().int().min(1).max(20000).nullish(),
    pattern: z.string().max(500).nullish(),
    patternMessage: z.string().max(200).nullish(),
    minDate: z.string().max(30).nullish(),
    maxDate: z.string().max(30).nullish(),
    maxSelections: z.number().int().min(1).max(500).nullish(),
    allowEmpty: z.boolean().nullish(),
    lookup: z
      .object({
        sheetId: zId,
        columnId: zId,
        parent: z.object({ localColumnId: zId, foreignColumnId: zId }).nullish(),
      })
      .nullish(),
  })
  .partial();

export const columnInput = z.object({
  name: z.string().trim().min(1, 'กรุณาตั้งชื่อคอลัมน์').max(200),
  dataType: z.enum(DATA_TYPES),
  isRequired: z.boolean().default(false),
  width: z.number().int().min(40).max(1200).default(160),
  defaultValue: z.any().optional(),
  placeholder: z.string().max(300).nullish(),
  description: z.string().max(500).nullish(),
  validation: validationSchema.nullish(),
  options: z.array(optionSchema).max(500).nullish(),
});
export type ColumnInput = z.infer<typeof columnInput>;

export const sheetInput = z.object({
  name: z.string().trim().min(1, 'กรุณาตั้งชื่อชีต').max(200),
  tabColor: zColor.nullish(),
  columns: z.array(columnInput).max(300).default([]),
});

export const filterSchema = z.object({
  columnId: z.string().max(60).transform((s) => s.toLowerCase()),
  mode: z.enum(['include', 'exclude']).optional(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).max(5000).optional(),
  blank: z.boolean().optional(),
  op: z
    .enum([
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
      'is_empty',
      'not_empty',
    ])
    .optional(),
  value: z.any().optional(),
  value2: z.any().optional(),
});

export const sortSchema = z.object({
  columnId: z.string().max(60).transform((s) => s.toLowerCase()),
  dir: z.enum(['asc', 'desc']),
});

/**
 * Validates a column definition beyond its shape: options for select types,
 * a compilable pattern, min <= max, and a default value that satisfies the column.
 * Returns the values to persist.
 */
export function checkColumnInput(input: ColumnInput) {
  const isSelect = input.dataType === 'select' || input.dataType === 'multi_select';
  const hasLookup = isSelect && !!input.validation?.lookup;
  let options: SelectOption[] = [];
  if (isSelect && !hasLookup) {
    options = (input.options ?? []).map((o) => ({ value: o.value, label: o.label, color: o.color ?? null }));
    if (!options.length) throw badRequest(`คอลัมน์ "${input.name}" ต้องมีตัวเลือกอย่างน้อย 1 รายการ`);
    const seen = new Set<string>();
    for (const o of options) {
      if (seen.has(o.value)) throw badRequest(`ตัวเลือก "${o.value}" ซ้ำในคอลัมน์ "${input.name}"`);
      seen.add(o.value);
    }
  }
  const validation = { ...(input.validation ?? {}) };
  if (validation.pattern) {
    try {
      new RegExp(validation.pattern);
    } catch {
      throw badRequest(`รูปแบบ (Regex) ของคอลัมน์ "${input.name}" ไม่ถูกต้อง`);
    }
  }
  if (validation.min != null && validation.max != null && validation.min > validation.max)
    throw badRequest(`ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด ในคอลัมน์ "${input.name}"`);

  let defaultValue: unknown = null;
  if (!hasLookup && input.defaultValue !== undefined && input.defaultValue !== null && input.defaultValue !== '') {
    const def: ColumnDef = {
      column_id: '',
      column_name: input.name,
      data_type: input.dataType,
      is_required: false,
      validation,
      options,
    };
    const n = normalizeValue(def, input.defaultValue);
    if (!n.ok) throw badRequest(`ค่าเริ่มต้นของ "${input.name}" ไม่ถูกต้อง: ${n.error}`);
    defaultValue = n.value;
  }
  return {
    validation: Object.keys(validation).length ? validation : null,
    options: isSelect ? options : null,
    defaultValue,
  };
}
