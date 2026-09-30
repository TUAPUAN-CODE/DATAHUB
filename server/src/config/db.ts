import sql from 'mssql';
import { env } from './env';

export type Tx = sql.Transaction;
let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function dbConfig(database: string = env.db.database, poolMax = env.db.poolMax): sql.config {
  return {
    server: env.db.server,
    port: env.db.instanceName ? undefined : env.db.port,
    database,
    user: env.db.user,
    password: env.db.password,
    options: {
      encrypt: env.db.encrypt,
      trustServerCertificate: env.db.trustServerCertificate,
      enableArithAbort: true,
      instanceName: env.db.instanceName,
    },
    pool: { min: Math.min(env.db.poolMin, poolMax), max: poolMax, idleTimeoutMillis: 30_000 },
    requestTimeout: 120_000,
    connectionTimeout: 30_000,
  };
}

export function getPool(): Promise<sql.ConnectionPool> {
  if (poolPromise) return poolPromise;
  const p: Promise<sql.ConnectionPool> = new sql.ConnectionPool(dbConfig())
    .connect()
    .catch((err) => {
      poolPromise = null;
      throw err;
    });
  poolPromise = p;
  return p;
}

export async function closePool() {
  if (poolPromise) {
    const p = await poolPromise;
    await p.close();
    poolPromise = null;
  }
}

/* ------------------------------------------------------------------ */
/* Typed parameters                                                    */
/* ------------------------------------------------------------------ */
interface TypedParam {
  __typed: true;
  type: any;
  value: unknown;
}
const typed = (type: any, value: unknown): TypedParam => ({ __typed: true, type, value });

export const T = {
  uuid: (v?: string | null) => typed(sql.UniqueIdentifier, v ?? null),
  dt: (v?: Date | string | null) => typed(sql.DateTime2, v == null || v === '' ? null : new Date(v)),
  text: (v?: string | null) => typed(sql.NVarChar(sql.MAX), v ?? null),
  bigint: (v?: number | null) => typed(sql.BigInt, v ?? null),
  int: (v?: number | null) => typed(sql.Int, v ?? null),
  float: (v?: number | null) => typed(sql.Float, v ?? null),
  bit: (v?: boolean | null) => typed(sql.Bit, v ?? null),
};

/** JSON array parameter for `IN (SELECT ... FROM OPENJSON(@p))` */
export const jsonParam = (arr: unknown[]) => T.text(JSON.stringify(arr));
/** SQL fragment that turns a JSON-array parameter into a set of uniqueidentifiers */
export const idList = (param: string) =>
  `(SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(${param}))`;

function bind(req: sql.Request, params: Record<string, unknown>) {
  for (const [name, v] of Object.entries(params)) {
    if (v && typeof v === 'object' && (v as TypedParam).__typed) {
      const t = v as TypedParam;
      req.input(name, t.type, t.value);
    } else if (v === undefined || v === null) req.input(name, sql.NVarChar(sql.MAX), null);
    else if (v instanceof Date) req.input(name, sql.DateTime2, v);
    else if (typeof v === 'boolean') req.input(name, sql.Bit, v);
    else if (typeof v === 'number') req.input(name, Number.isInteger(v) ? sql.BigInt : sql.Float, v);
    else req.input(name, sql.NVarChar(sql.MAX), String(v));
  }
}

/* SQL Server returns GUIDs in upper case; the API always uses lower case. */
const GUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const ID_NAME_RE = /(^id$|_id$|_by$)/i;

function normalize<T>(rs: sql.IRecordSet<any> | undefined): T[] {
  if (!rs) return [];
  const meta = (rs as any).columns ?? {};
  const cols = Object.values<any>(meta)
    .filter((c) => c.type === sql.UniqueIdentifier || ID_NAME_RE.test(c.name))
    .map((c) => c.name as string);
  if (cols.length) {
    for (const row of rs as any[]) {
      for (const c of cols) {
        const v = row[c];
        if (typeof v === 'string' && GUID_RE.test(v)) row[c] = v.toLowerCase();
      }
    }
  }
  return rs as unknown as T[];
}

async function request(tx?: Tx | null) {
  return tx ? new sql.Request(tx) : (await getPool()).request();
}

export async function q<T = any>(text: string, params: Record<string, unknown> = {}, tx?: Tx | null): Promise<T[]> {
  const req = await request(tx);
  bind(req, params);
  const res = await req.query(text);
  return normalize<T>(res.recordset);
}

export async function q1<T = any>(text: string, params: Record<string, unknown> = {}, tx?: Tx | null): Promise<T | null> {
  const rows = await q<T>(text, params, tx);
  return rows[0] ?? null;
}

/** Runs a batch and returns every recordset */
export async function qm(text: string, params: Record<string, unknown> = {}, tx?: Tx | null): Promise<any[][]> {
  const req = await request(tx);
  bind(req, params);
  const res = await req.query(text);
  const sets = (res.recordsets as unknown as sql.IRecordSet<any>[]) ?? [];
  return sets.map((s) => normalize<any>(s));
}

/** Runs fn inside a transaction. Requests inside must be awaited sequentially. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}
