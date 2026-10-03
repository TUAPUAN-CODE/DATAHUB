/**
 * Scale test for ONE sheet: fills a TEST sheet with synthetic rows and times the queries the grid uses.
 *
 *   npm run bench -- --sheet <sheetId> --seed 1000000      (adds rows, then measures)
 *   npm run bench -- --sheet <sheetId>                     (only measures what is there)
 *   npm run bench -- --sheet <sheetId> --purge --yes       (deletes ALL rows of that sheet — use a dedicated test sheet!)
 *
 * Use a COPY / test database first: 1,000,000 rows × 12 columns writes ~12 million cells.
 */
import crypto from 'crypto';
import sql from 'mssql';
import 'dotenv/config';
import { getPool, q, q1, closePool } from '../config/db';
import { loadColumns } from '../services/cellWriter';
import { distinctValues, queryRows } from '../services/rowQuery';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);
const BATCH = 5000;
const WORDS = ['ไก่', 'ปลา', 'ผัก', 'หมู', 'กุ้ง', 'ข้าว', 'แป้ง', 'น้ำมัน', 'เกลือ', 'น้ำตาล', 'พริก', 'กระเทียม'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

async function seed(sheetId: string, total: number, userId: string, cols: any[]) {
  const pool = await getPool();
  const start = Number((await q1(`SELECT ISNULL(MAX(row_order), 0) AS m FROM Rows WHERE sheet_id = @s`, { s: sheetId }))?.m ?? 0);
  const t0 = Date.now();
  for (let done = 0; done < total; done += BATCH) {
    const n = Math.min(BATCH, total - done);
    const rows = new sql.Table('Rows');
    rows.columns.add('row_id', sql.UniqueIdentifier, { nullable: false });
    rows.columns.add('sheet_id', sql.UniqueIdentifier, { nullable: false });
    rows.columns.add('row_order', sql.Int, { nullable: false });
    rows.columns.add('created_by', sql.UniqueIdentifier, { nullable: false });
    rows.columns.add('updated_by', sql.UniqueIdentifier, { nullable: true });
    const cells = new sql.Table('Cells');
    cells.columns.add('row_id', sql.UniqueIdentifier, { nullable: false });
    cells.columns.add('column_id', sql.UniqueIdentifier, { nullable: false });
    cells.columns.add('value_text', sql.NVarChar(sql.MAX), { nullable: true });
    cells.columns.add('value_int', sql.BigInt, { nullable: true });
    cells.columns.add('value_float', sql.Float, { nullable: true });
    cells.columns.add('value_date', sql.DateTime2, { nullable: true });
    cells.columns.add('value_bool', sql.Bit, { nullable: true });
    cells.columns.add('updated_by', sql.UniqueIdentifier, { nullable: false });
    for (let i = 0; i < n; i++) {
      const rid = crypto.randomUUID();
      rows.rows.add(rid, sheetId, start + done + i + 1, userId, userId);
      for (const c of cols) {
        let text: string | null = null, int: number | null = null, flt: number | null = null, date: Date | null = null, bool: boolean | null = null;
        switch (c.data_type) {
          case 'varchar': case 'text': text = `${pick(WORDS)}-${Math.floor(Math.random() * 100000)}`; break;
          case 'select': { const o = JSON.parse(c.select_options || '[]'); text = o.length ? pick<{ value: string }>(o).value : pick(WORDS); break; }
          case 'int': int = Math.floor(Math.random() * 100000); break;
          case 'float': flt = Math.round(Math.random() * 1_000_000) / 1000; break;
          case 'date': case 'datetime': date = new Date(Date.now() - Math.floor(Math.random() * 365 * 86400_000)); break;
          case 'boolean': bool = Math.random() < 0.5; break;
          default: continue; // doc_number / image / multi_select: left empty
        }
        cells.rows.add(rid, c.column_id, text, int, flt, date, bool, userId);
      }
    }
    await pool.request().bulk(rows);
    await pool.request().bulk(cells);
    if ((done / BATCH) % 20 === 0) console.log(`  seeded ${done + n} / ${total}  (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  console.log(`seed done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

async function time(label: string, fn: () => Promise<unknown>, reps = 3) {
  const ms: number[] = [];
  try {
    for (let i = 0; i < reps; i++) { const t = Date.now(); await fn(); ms.push(Date.now() - t); }
    ms.sort((a, b) => a - b);
    return { label, ms: ms[Math.floor(ms.length / 2)], note: '' };
  } catch (e) { return { label, ms: -1, note: (e as Error).message.slice(0, 80) }; }
}

async function main() {
  const sheetId = arg('sheet');
  if (!sheetId) throw new Error('--sheet <sheetId> is required');
  const cols = await loadColumns(sheetId);
  if (flag('purge')) {
    if (!flag('yes')) throw new Error('--purge deletes ALL rows of the sheet: add --yes to confirm');
    for (;;) { const r = await q(`DELETE TOP (100000) FROM Cells WHERE row_id IN (SELECT row_id FROM Rows WHERE sheet_id = @s); SELECT @@ROWCOUNT AS n`, { s: sheetId }); if (!Number(r[0]?.n)) break; }
    await q(`DELETE FROM Rows WHERE sheet_id = @s`, { s: sheetId });
    console.log('purged');
    return;
  }
  const total = Number(arg('seed') ?? 0);
  if (total > 0) {
    const userId = arg('user') ?? (await q1(`SELECT TOP 1 user_id FROM Users ORDER BY created_at`))?.user_id;
    await seed(sheetId, total, userId, cols);
  }
  const rowsInSheet = Number((await q1(`SELECT COUNT_BIG(*) AS n FROM Rows WHERE sheet_id = @s AND is_deleted = 0`, { s: sheetId }))?.n ?? 0);
  console.log(`\nSheet has ${rowsInSheet.toLocaleString()} rows, ${cols.length} columns. Median of 3 runs:\n`);
  const byType = (t: string[]) => cols.find((c) => t.includes(c.data_type));
  const text = byType(['varchar', 'text']), num = byType(['int', 'float']), date = byType(['date', 'datetime']), sel = byType(['select']);
  const sample = async (c: any) => (await q1(`SELECT TOP 1 value_text, value_int, value_float FROM Cells WHERE column_id = @c AND (value_text IS NOT NULL OR value_int IS NOT NULL OR value_float IS NOT NULL)`, { c: c.column_id })) as any;
  const results = [] as { label: string; ms: number; note: string }[];
  results.push(await time('page 1, no sort / filter', () => queryRows(sheetId, cols, { page: 1, pageSize: 100 })));
  results.push(await time('page 1000 (deep paging)', () => queryRows(sheetId, cols, { page: 1000, pageSize: 100 })));
  if (num) results.push(await time(`sort by ${num.column_name} (number)`, () => queryRows(sheetId, cols, { page: 1, pageSize: 100, sorts: [{ columnId: num.column_id, dir: 'asc' }] })));
  if (date) results.push(await time(`sort by ${date.column_name} (date)`, () => queryRows(sheetId, cols, { page: 1, pageSize: 100, sorts: [{ columnId: date.column_id, dir: 'desc' }] })));
  if (text) results.push(await time(`sort by ${text.column_name} (text)`, () => queryRows(sheetId, cols, { page: 1, pageSize: 100, sorts: [{ columnId: text.column_id, dir: 'asc' }] })));
  if (sel) { const v = (await sample(sel))?.value_text; if (v) results.push(await time(`filter ${sel.column_name} = ${v}`, () => queryRows(sheetId, cols, { page: 1, pageSize: 100, filters: [{ columnId: sel.column_id, op: 'eq', value: v }] }))); }
  if (num) { const v = (await sample(num)); const x = v?.value_int ?? v?.value_float; if (x !== undefined && x !== null) results.push(await time(`filter ${num.column_name} = ${x}`, () => queryRows(sheetId, cols, { page: 1, pageSize: 100, filters: [{ columnId: num.column_id, op: 'eq', value: x }] }))); }
  if (text) results.push(await time(`filter ${text.column_name} contains "12"`, () => queryRows(sheetId, cols, { page: 1, pageSize: 100, filters: [{ columnId: text.column_id, op: 'contains', value: '12' }] })));
  results.push(await time('free-text search "12"', () => queryRows(sheetId, cols, { page: 1, pageSize: 100, search: '12', filters: [] })));
  if (sel) results.push(await time(`value list of ${sel.column_name}`, () => distinctValues(sheetId, cols, sel.column_id, {})));
  console.log('| query | median ms |\n|---|---|');
  for (const r of results) console.log(`| ${r.label} | ${r.ms < 0 ? `ERROR ${r.note}` : r.ms.toLocaleString()} |`);
  console.log('\nRule of thumb: under 300 ms feels instant, 300–1500 ms is OK, above 3000 ms needs work (see docs/SCALE.md).');
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => void closePool());
