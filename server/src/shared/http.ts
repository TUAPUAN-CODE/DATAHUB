import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodTypeAny } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, 'BAD_REQUEST', m, d);
export const unauthorized = (m = 'กรุณาเข้าสู่ระบบ', code = 'UNAUTHORIZED') => new AppError(401, code, m);
export const forbidden = (m = 'คุณไม่มีสิทธิ์ดำเนินการนี้', code = 'FORBIDDEN', d?: unknown) =>
  new AppError(403, code, m, d);
export const notFound = (m = 'ไม่พบข้อมูลที่ต้องการ') => new AppError(404, 'NOT_FOUND', m);
export const conflict = (m: string, code = 'CONFLICT', d?: unknown) => new AppError(409, code, m, d);

/** Wraps an async route so rejected promises reach the error middleware */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw badRequest(first ? `ข้อมูลไม่ถูกต้อง (${first.path || 'ค่า'}): ${first.message}` : 'ข้อมูลไม่ถูกต้อง', issues);
  }
  return r.data;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: unknown): v is string => typeof v === 'string' && GUID.test(v);
export const zId = z
  .string()
  .regex(GUID, 'รหัสอ้างอิงไม่ถูกต้อง')
  .transform((s) => s.toLowerCase());
export const zColor = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'รูปแบบสีไม่ถูกต้อง');

export function pid(req: Request, name = 'id'): string {
  const v = req.params[name];
  if (!isGuid(v)) throw badRequest('รหัสอ้างอิงไม่ถูกต้อง');
  return v.toLowerCase();
}

export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data });
}

export function pageParams(query: any, defSize = 25, maxSize = 200) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number(query.pageSize) || defSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function safeJson<T>(s: string | null | undefined, d: T): T {
  if (s === null || s === undefined || s === '') return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
}

/** Escapes LIKE wildcards for SQL Server */
export const likeEscape = (s: string) => s.replace(/[[\]%_]/g, (m) => `[${m}]`);
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const reqMeta = (req?: Request) => ({
  ip: req?.ip ?? null,
  ua: req?.headers['user-agent']?.slice(0, 500) ?? null,
  socketId: (req?.headers['x-socket-id'] as string | undefined) ?? undefined,
});
