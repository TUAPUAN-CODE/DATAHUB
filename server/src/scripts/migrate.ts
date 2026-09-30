import fs from 'fs';
import path from 'path';
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
  for (const f of files) {
    const batches = fs.readFileSync(path.join(dir, f), 'utf8').split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
    for (const b of batches) await pool.request().batch(b);
    logger.info(`Migration applied: ${f}`);
  }
}
