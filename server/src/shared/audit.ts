import { Request } from 'express';
import { q, T, Tx } from '../config/db';
import { reqMeta } from './http';

export interface AuditEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  fileId?: string | null;
  sheetId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

const enc = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

/** Inserts any number of audit rows with a single statement per 500 rows. */
export async function auditMany(entries: AuditEntry[], req?: Request, tx?: Tx) {
  if (!entries.length) return;
  const { ip, ua } = reqMeta(req);
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500).map((e) => ({
      user_id: e.userId,
      action_type: e.action,
      entity_type: e.entityType,
      entity_id: String(e.entityId).slice(0, 100),
      file_id: e.fileId ?? null,
      sheet_id: e.sheetId ?? null,
      old_value: enc(e.oldValue),
      new_value: enc(e.newValue),
    }));
    await q(
      `INSERT INTO AuditLog (user_id, action_type, entity_type, entity_id, file_id, sheet_id, old_value, new_value, ip_address, user_agent)
       SELECT user_id, action_type, entity_type, entity_id, file_id, sheet_id, old_value, new_value, @ip, @ua
       FROM OPENJSON(@j) WITH (
         user_id UNIQUEIDENTIFIER, action_type NVARCHAR(50), entity_type NVARCHAR(50), entity_id NVARCHAR(100),
         file_id UNIQUEIDENTIFIER, sheet_id UNIQUEIDENTIFIER, old_value NVARCHAR(MAX), new_value NVARCHAR(MAX))`,
      { j: T.text(JSON.stringify(chunk)), ip: T.text(ip), ua: T.text(ua) },
      tx,
    );
  }
}

export const audit = (e: AuditEntry, req?: Request, tx?: Tx) => auditMany([e], req, tx);
