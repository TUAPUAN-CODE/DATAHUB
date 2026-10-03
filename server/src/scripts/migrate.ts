import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import { getPool } from '../config/db';
import { logger } from '../shared/logger';

/**
 * Applies every database/NN_*.sql file with NN >= 02 (all idempotent), so an existing
 * database picks up new tables without a manual step. 01_schema.sql is handled by db:init.
 */
export async function applyMigrations() {
  const dir = path.resolve(__dirname, '../../../database');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => /^(0[2-9]|[1-9]\d)_.*\.sql$/.test(f)).sort();
  const pool = await getPool();
  // two servers starting together: one waits for the other (app lock held by the transaction), the scripts are idempotent
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = N'dochub-migrate', @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 120000; IF @r < 0 THROW 50000, N'migration lock timeout', 1;`);
    for (const f of files) {
      const batches = fs.readFileSync(path.join(dir, f), 'utf8').split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
      for (const b of batches) await new sql.Request(tx).batch(b);
      logger.info(`Migration applied: ${f}`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    throw e;
  }
}
