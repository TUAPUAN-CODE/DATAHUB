/** Pure rules of mixing (kept apart from the database so they can be tested) */
export interface MixCfg {
  /** the number column the amounts are cut from (e.g. remaining weight); the new lot's total goes into the same column */
  deductColumnId: string;
  /** column used to find a row by scan / typing (e.g. mapping_id) */
  keyColumnId?: string | null;
  /** copied from the first input to the new lot (e.g. material type) */
  inheritColumnIds?: string[] | null;
  /** all inputs must have the same value here (e.g. do not mix different material groups) */
  sameColumnIds?: string[] | null;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** remaining after cutting `qty`; throws a Thai message the user can act on */
export function cut(current: number | null, qty: number, rowNo: number, integer: boolean): number {
  if (!Number.isFinite(qty) || qty <= 0) throw new Error(`แถว ${rowNo}: จำนวนที่ใช้ต้องมากกว่า 0`);
  if (integer && !Number.isInteger(qty)) throw new Error(`แถว ${rowNo}: คอลัมน์ที่ตัดเป็นจำนวนเต็ม แต่ใส่ ${qty}`);
  if (current === null || !Number.isFinite(current)) throw new Error(`แถว ${rowNo}: ยังไม่มีค่าคงเหลือให้ตัด`);
  if (qty > current + 1e-9) throw new Error(`แถว ${rowNo}: ใช้ ${qty} เกินคงเหลือ ${current}`);
  return round6(current - qty);
}

export const sumQty = (qtys: number[]) => round6(qtys.reduce((a, b) => a + b, 0));

/** the first column whose values differ between inputs (so mixing is refused), or null */
export function firstMismatch(rows: Record<string, unknown>[], columnIds: string[]): string | null {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  for (const id of columnIds) if (new Set(rows.map((r) => norm(r[id]))).size > 1) return id;
  return null;
}
