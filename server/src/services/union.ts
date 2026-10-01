import crypto from 'crypto';
import { idList, jsonParam, q, q1, T, withTx } from '../config/db';
import { AuthUser } from '../middleware/auth';
import { badRequest } from '../shared/http';
import { logger } from '../shared/logger';
import { safeJson } from '../shared/http';
import { LV, requireSheet } from '../shared/permissions';
import { emitToSheet } from '../socket';
import { loadColumns } from './cellWriter';

/**
 * Union sheet = one sheet whose rows are gathered from several source sheets that share EXACTLY the same columns.
 * Rows are mirrored (kept in the union sheet's own Rows / Cells) so filters, sorting, export and dashboards work unchanged.
 * The mirror is read-only and re-synced from the sources automatically.
 */
export interface UnionConfig {
  sources: { sheetId: string }[];
  createdBy: string;
  lastSyncAt?: string | null;
  results?: { sheetId: string; ok: boolean; message?: string; rows?: number }[];
}
export const SOURCE_COLUMN = 'แหล่งที่มา';

export const readUnionConfig = (sheet: { union_config?: string | null }): UnionConfig | null => safeJson<UnionConfig | null>(sheet.union_config ?? null, null);

/* ---------------- structure comparison ---------------- */
interface Sig { name: string; type: string; required: boolean; validation: string; options: string }

const stable = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== null && o[k] !== undefined && o[k] !== '').sort();
    return keys.length ? `{${keys.map((k) => `${k}:${stable(o[k])}`).join(',')}}` : '';
  }
  return JSON.stringify(v);
};

async function signature(sheetId: string): Promise<Sig[]> {
  const cols = await loadColumns(sheetId);
  return cols.map((c) => ({
    name: String(c.column_name).trim().toLowerCase(),
    type: c.data_type,
    required: !!c.is_required,
    validation: stable(safeJson(c.validation_rule, null)),
    options: stable((safeJson<{ value: string; label: string }[]>(c.select_options, []) ?? []).map((o) => [o.value, o.label])),
  }));
}

const TYPE_LABEL: Record<string, string> = { varchar: 'ข้อความสั้น', text: 'ข้อความยาว', int: 'จำนวนเต็ม', float: 'ทศนิยม', date: 'วันที่', datetime: 'วันที่และเวลา', boolean: 'ใช่/ไม่ใช่', select: 'ตัวเลือกเดียว', multi_select: 'หลายตัวเลือก', url: 'ลิงก์', email: 'อีเมล', image: 'รูปภาพ', doc_number: 'เลขที่เอกสารอัตโนมัติ' };

/** Human readable differences between two column sets (names are matched case-insensitively; order does not matter) */
export function diffSignatures(base: Sig[], other: Sig[]): string[] {
  const out: string[] = [];
  const bm = new Map(base.map((s) => [s.name, s]));
  const om = new Map(other.map((s) => [s.name, s]));
  for (const [n] of bm) if (!om.has(n)) out.push(`ไม่มีคอลัมน์ “${n}”`);
  for (const [n] of om) if (!bm.has(n)) out.push(`มีคอลัมน์เกิน “${n}”`);
  for (const [n, a] of bm) {
    const b = om.get(n);
    if (!b) continue;
    if (a.type !== b.type) out.push(`คอลัมน์ “${n}” ชนิดข้อมูลต่างกัน (${TYPE_LABEL[a.type] ?? a.type} ≠ ${TYPE_LABEL[b.type] ?? b.type})`);
    else {
      if (a.required !== b.required) out.push(`คอลัมน์ “${n}” การบังคับกรอกต่างกัน`);
      if (a.options !== b.options) out.push(`คอลัมน์ “${n}” ตัวเลือกต่างกัน`);
      if (a.validation !== b.validation) out.push(`คอลัมน์ “${n}” กฎตรวจสอบ/การตั้งค่าต่างกัน`);
    }
  }
  return out;
}

interface SourceInfo { sheetId: string; label: string; fileName: string; sheetName: string }

async function describeSource(sheetId: string): Promise<SourceInfo | null> {
  const r = await q1(
    `SELECT s.sheet_id, s.sheet_name, f.file_name, s.union_config FROM Sheets s JOIN Files f ON f.file_id = s.file_id
     WHERE s.sheet_id = @id AND s.is_deleted = 0 AND f.is_deleted = 0`, { id: T.uuid(sheetId) });
  return r ? { sheetId: r.sheet_id, fileName: r.file_name, sheetName: r.sheet_name, label: `${r.file_name} / ${r.sheet_name}` } : null;
}

/** Validates the chosen sources (readable, not unions, identical structure). Throws a 400 listing every difference. */
export async function assertUnionSources(user: AuthUser, sourceIds: string[], exceptUnionId?: string): Promise<SourceInfo[]> {
  const ids = [...new Set(sourceIds.map((s) => s.toLowerCase()))];
  if (!ids.length) throw badRequest('กรุณาเลือกชีตต้นทางอย่างน้อย 1 ชีต');
  if (ids.length > 50) throw badRequest('รวมได้สูงสุด 50 ชีต');
  const infos: SourceInfo[] = [];
  for (const id of ids) {
    if (id === exceptUnionId) throw badRequest('ชีตรวมข้อมูลไม่สามารถใช้ตัวเองเป็นต้นทางได้');
    const { sheet } = await requireSheet(user, id, LV.read);
    if (sheet.union_config) throw badRequest(`“${sheet.file_name} / ${sheet.sheet_name}” เป็นชีตรวมข้อมูลอยู่แล้ว ไม่รองรับการรวมซ้อนกัน`);
    infos.push({ sheetId: sheet.sheet_id, fileName: sheet.file_name, sheetName: sheet.sheet_name, label: `${sheet.file_name} / ${sheet.sheet_name}` });
  }
  const base = await signature(infos[0].sheetId);
  if (!base.length) throw badRequest(`“${infos[0].label}” ยังไม่มีคอลัมน์`);
  const problems: { source: string; differences: string[] }[] = [];
  for (const info of infos.slice(1)) {
    const d = diffSignatures(base, await signature(info.sheetId));
    if (d.length) problems.push({ source: info.label, differences: d });
  }
  if (problems.length)
    throw badRequest(
      `โครงสร้างคอลัมน์ไม่ตรงกับ “${infos[0].label}”: ${problems.map((p) => `${p.source} → ${p.differences[0]}${p.differences.length > 1 ? ` (+${p.differences.length - 1})` : ''}`).join('; ')}`,
      { problems },
    );
  return infos;
}

/** Creates the union sheet (columns copied from the first source + a "source" column). Runs inside a transaction. */
export async function createUnionSheet(tx: Parameters<Parameters<typeof withTx>[0]>[0], fileId: string, name: string, sort: number, sources: SourceInfo[], userId: string) {
  const cfg: UnionConfig = { sources: sources.map((s) => ({ sheetId: s.sheetId })), createdBy: userId, lastSyncAt: null, results: [] };
  const sh = await q1(
    `INSERT INTO Sheets (file_id, sheet_name, sort_order, created_by, union_config) OUTPUT inserted.sheet_id VALUES (@f, @n, @o, @u, @cfg)`,
    { f: T.uuid(fileId), n: name, o: T.int(sort), u: T.uuid(userId), cfg: T.text(JSON.stringify(cfg)) }, tx);
  const sheetId = sh!.sheet_id as string;
  const srcCols = await loadColumns(sources[0].sheetId);
  const taken = new Set(srcCols.map((c) => String(c.column_name).trim().toLowerCase()));
  let label = SOURCE_COLUMN;
  while (taken.has(label.toLowerCase())) label += ' (รวม)';
  await q(`INSERT INTO Columns (sheet_id, column_name, data_type, display_order, width, is_required, created_by) VALUES (@s, @n, N'varchar', 0, 220, 0, @u)`,
    { s: T.uuid(sheetId), n: label, u: T.uuid(userId) }, tx);
  for (const [i, c] of srcCols.entries())
    await q(
      `INSERT INTO Columns (sheet_id, column_name, data_type, display_order, width, is_required, default_value, placeholder, validation_rule, select_options, description, created_by)
       VALUES (@s, @n, @t, @o, @w, @r, @dv, @ph, @vr, @so, @d, @u)`,
      { s: T.uuid(sheetId), n: c.column_name, t: c.data_type, o: T.int(i + 1), w: T.int(c.width), r: T.bit(!!c.is_required), dv: T.text(c.default_value), ph: T.text(c.placeholder),
        vr: T.text(c.validation_rule), so: T.text(c.select_options), d: T.text(c.description), u: T.uuid(userId) }, tx);
  return sheetId;
}

/* ---------------- sync ---------------- */
const running = new Map<string, Promise<UnionConfig>>();
const CHUNK = 1500;

export function syncUnion(sheetId: string): Promise<UnionConfig> {
  const hit = running.get(sheetId);
  if (hit) return hit;
  const p = doSync(sheetId).finally(() => running.delete(sheetId));
  running.set(sheetId, p);
  return p;
}

async function doSync(unionId: string): Promise<UnionConfig> {
  const sheet = await q1(`SELECT sheet_id, union_config FROM Sheets WHERE sheet_id = @id AND is_deleted = 0`, { id: T.uuid(unionId) });
  const cfg = sheet && readUnionConfig(sheet);
  if (!sheet || !cfg) throw badRequest('ไม่ใช่ชีตรวมข้อมูล');
  const ucols = (await loadColumns(unionId)).filter((c) => !c.is_deleted);
  const unionSig = await signature(unionId);
  // The first column is the "source" column; the rest must equal the sources
  const labelCol = ucols[0];
  const dataCols = ucols.slice(1);
  const dataSig = unionSig.slice(1);
  const byName = new Map(dataCols.map((c) => [String(c.column_name).trim().toLowerCase(), c.column_id as string]));

  const results: NonNullable<UnionConfig['results']> = [];
  const order: { sheet_id: string; idx: number }[] = [];
  let changed = false;
  for (const [idx, src] of cfg.sources.entries()) {
    order.push({ sheet_id: src.sheetId, idx });
    const info = await describeSource(src.sheetId);
    if (!info) { results.push({ sheetId: src.sheetId, ok: false, message: 'ไม่พบชีตต้นทาง (ถูกลบแล้ว) — คงข้อมูลเดิมไว้' }); continue; }
    const diff = diffSignatures(dataSig, await signature(src.sheetId));
    if (diff.length) { results.push({ sheetId: src.sheetId, ok: false, message: `โครงสร้างไม่ตรงกันแล้ว: ${diff[0]}${diff.length > 1 ? ` (+${diff.length - 1})` : ''} — คงข้อมูลเดิมไว้` }); continue; }

    const scols = await loadColumns(src.sheetId);
    const colMap = scols.map((c) => ({ src: c.column_id as string, dst: byName.get(String(c.column_name).trim().toLowerCase())! })).filter((m) => m.dst);
    const srcRows = await q(`SELECT row_id, updated_at FROM Rows WHERE sheet_id = @s AND is_deleted = 0`, { s: T.uuid(src.sheetId) });
    const mirror = await q(`SELECT row_id, source_row_id, updated_at FROM Rows WHERE sheet_id = @u AND source_sheet_id = @s`, { u: T.uuid(unionId), s: T.uuid(src.sheetId) });
    const mByS = new Map(mirror.map((m) => [m.source_row_id as string, m]));
    const sSet = new Set(srcRows.map((r) => r.row_id as string));
    const toDelete = mirror.filter((m) => !sSet.has(m.source_row_id)).map((m) => m.row_id as string);
    const toInsert = srcRows.filter((r) => !mByS.has(r.row_id)).map((r) => r.row_id as string);
    const toUpdate = srcRows.filter((r) => { const m = mByS.get(r.row_id); return m && new Date(m.updated_at).getTime() !== new Date(r.updated_at).getTime(); }).map((r) => ({ src: r.row_id as string, dst: mByS.get(r.row_id)!.row_id as string }));

    if (toDelete.length || toInsert.length || toUpdate.length) changed = true;
    await withTx(async (tx) => {
      for (let i = 0; i < toDelete.length; i += CHUNK) {
        const ids = jsonParam(toDelete.slice(i, i + CHUNK));
        await q(`DELETE FROM Cells WHERE row_id IN ${idList('@ids')}`, { ids }, tx);
        await q(`DELETE FROM Rows WHERE row_id IN ${idList('@ids')}`, { ids }, tx);
      }
      // rows that changed: drop their cells and copy again
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK);
        await q(`DELETE FROM Cells WHERE row_id IN ${idList('@ids')}`, { ids: jsonParam(chunk.map((c) => c.dst)) }, tx);
        await q(`UPDATE r SET r.updated_at = sr.updated_at, r.updated_by = sr.updated_by
                 FROM Rows r JOIN OPENJSON(@rm) WITH (src UNIQUEIDENTIFIER, dst UNIQUEIDENTIFIER) m ON m.dst = r.row_id JOIN Rows sr ON sr.row_id = m.src`,
          { rm: T.text(JSON.stringify(chunk)) }, tx);
        await copyCells(tx, chunk, colMap, labelCol.column_id, info.label, cfg.createdBy);
      }
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK).map((s) => ({ src: s, dst: crypto.randomUUID() }));
        await q(`INSERT INTO Rows (row_id, sheet_id, row_order, created_by, created_at, updated_by, updated_at, source_row_id, source_sheet_id)
                 SELECT m.dst, @u, 0, sr.created_by, sr.created_at, sr.updated_by, sr.updated_at, sr.row_id, @s
                 FROM OPENJSON(@rm) WITH (src UNIQUEIDENTIFIER, dst UNIQUEIDENTIFIER) m JOIN Rows sr ON sr.row_id = m.src`,
          { u: T.uuid(unionId), s: T.uuid(src.sheetId), rm: T.text(JSON.stringify(chunk)) }, tx);
        await copyCells(tx, chunk, colMap, labelCol.column_id, info.label, cfg.createdBy);
      }
    });
    results.push({ sheetId: src.sheetId, ok: true, rows: srcRows.length });
  }

  // rows of sources that were removed from the union
  const removed = await q(`SELECT row_id FROM Rows WHERE sheet_id = @u AND source_sheet_id IS NOT NULL AND source_sheet_id NOT IN ${idList('@keep')}`,
    { u: T.uuid(unionId), keep: jsonParam(cfg.sources.map((s) => s.sheetId)) });
  if (removed.length) {
    changed = true;
    await withTx(async (tx) => {
      for (let i = 0; i < removed.length; i += CHUNK) {
        const ids = jsonParam(removed.slice(i, i + CHUNK).map((r) => r.row_id));
        await q(`DELETE FROM Cells WHERE row_id IN ${idList('@ids')}`, { ids }, tx);
        await q(`DELETE FROM Rows WHERE row_id IN ${idList('@ids')}`, { ids }, tx);
      }
    });
  }

  if (changed) {
    // numbering: by source order, then the row order inside the source
    await q(
      `UPDATE r SET r.row_order = x.rn
       FROM Rows r JOIN (
         SELECT m.row_id, ROW_NUMBER() OVER (ORDER BY j.idx, s.row_order) AS rn
         FROM Rows m JOIN OPENJSON(@o) WITH (sheet_id UNIQUEIDENTIFIER, idx INT) j ON j.sheet_id = m.source_sheet_id
         JOIN Rows s ON s.row_id = m.source_row_id WHERE m.sheet_id = @u AND m.is_deleted = 0) x ON x.row_id = r.row_id`,
      { o: T.text(JSON.stringify(order)), u: T.uuid(unionId) });
  }
  const next: UnionConfig = { ...cfg, lastSyncAt: new Date().toISOString(), results };
  await q(`UPDATE Sheets SET union_config = @c, updated_at = SYSUTCDATETIME() WHERE sheet_id = @id`, { c: T.text(JSON.stringify(next)), id: T.uuid(unionId) });
  if (changed) emitToSheet(unionId, 'rows:changed', { sheetId: unionId, action: 'sync', by: 'ระบบ' });
  logger.info(`Union sheet ${unionId} synced (${results.map((r) => (r.ok ? r.rows : 'x')).join('+')} rows${changed ? ', changed' : ''})`);
  return next;
}

async function copyCells(tx: Parameters<Parameters<typeof withTx>[0]>[0], chunk: { src: string; dst: string }[], colMap: { src: string; dst: string }[], labelColId: string, label: string, userId: string) {
  await q(
    `INSERT INTO Cells (row_id, column_id, value_text, value_int, value_float, value_date, value_bool, value_json, updated_by, updated_at)
     SELECT rm.dst, cm.dst, sc.value_text, sc.value_int, sc.value_float, sc.value_date, sc.value_bool, sc.value_json, sc.updated_by, sc.updated_at
     FROM OPENJSON(@rm) WITH (src UNIQUEIDENTIFIER, dst UNIQUEIDENTIFIER) rm
     JOIN Cells sc ON sc.row_id = rm.src
     JOIN OPENJSON(@cm) WITH (src UNIQUEIDENTIFIER, dst UNIQUEIDENTIFIER) cm ON cm.src = sc.column_id`,
    { rm: T.text(JSON.stringify(chunk)), cm: T.text(JSON.stringify(colMap)) }, tx);
  await q(
    `INSERT INTO Cells (row_id, column_id, value_text, updated_by)
     SELECT rm.dst, @lc, @label, @u FROM OPENJSON(@rm) WITH (src UNIQUEIDENTIFIER, dst UNIQUEIDENTIFIER) rm`,
    { rm: T.text(JSON.stringify(chunk)), lc: T.uuid(labelColId), label: T.text(label), u: T.uuid(userId) }, tx);
}

/** Starts a background sync when the data is older than `maxAgeMs` (never blocks the request) */
export function syncUnionIfStale(sheet: { sheet_id: string; union_config?: string | null }, maxAgeMs = 30_000) {
  const cfg = readUnionConfig(sheet);
  if (!cfg) return;
  const age = cfg.lastSyncAt ? Date.now() - new Date(cfg.lastSyncAt).getTime() : Infinity;
  if (age > maxAgeMs) void syncUnion(sheet.sheet_id).catch((e) => logger.warn(`Union sync failed: ${e?.message}`));
}

/** Sources + last sync, for the sheet screen */
export async function unionStatus(sheet: { union_config?: string | null }) {
  const cfg = readUnionConfig(sheet);
  if (!cfg) return null;
  const sources: { sheetId: string; fileName: string | null; sheetName: string | null; ok: boolean; message: string | null; rows: number | null }[] = [];
  for (const src of cfg.sources) {
    const info = await describeSource(src.sheetId);
    const r = cfg.results?.find((x) => x.sheetId === src.sheetId);
    sources.push({ sheetId: src.sheetId, fileName: info?.fileName ?? null, sheetName: info?.sheetName ?? null, ok: info ? r?.ok ?? true : false, message: info ? r?.message ?? null : 'ไม่พบชีตต้นทาง', rows: r?.rows ?? null });
  }
  return { sources, lastSyncAt: cfg.lastSyncAt ?? null };
}
