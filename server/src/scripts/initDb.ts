/* Creates the database (if missing) and applies database/01_schema.sql.
 *   npm run db:init          – create if missing
 *   npm run db:reset         – DROP and recreate (destroys all data!) */
import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import { dbConfig } from '../config/db';
import { env } from '../config/env';
import { applyMigrations } from './migrate';

async function main() {
  const force = process.argv.includes('--force');
  const name = env.db.database;
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('DB_NAME may only contain letters, digits and _');

  const master = await new sql.ConnectionPool(dbConfig('master', 1)).connect();
  if (force) {
    console.log(`Dropping database ${name}…`);
    await master.request().query(`IF DB_ID(N'${name}') IS NOT NULL BEGIN
      ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`);
  }
  const exists = await master.request().query(`SELECT DB_ID(N'${name}') AS id`);
  if (!exists.recordset[0].id) {
    console.log(`Creating database ${name}…`);
    await master.request().query(`CREATE DATABASE [${name}] COLLATE Thai_CI_AS`);
    try {
      await master.request().query(`ALTER DATABASE [${name}] SET COMPATIBILITY_LEVEL = 150`);
    } catch {
      console.warn('Could not set compatibility level 150 — SQL Server 2016+ (level 130+) is required for OPENJSON.');
    }
  }
  await master.close();

  const db = await new sql.ConnectionPool(dbConfig(name, 1)).connect();
  const has = await db.request().query(`SELECT OBJECT_ID(N'dbo.Users') AS id`);
  if (has.recordset[0].id) {
    console.log('Schema already present. Applying pending migrations… (use db:reset to recreate everything)');
    await db.close();
    await applyMigrations();
    process.exit(0);
  }
  const file = path.resolve(__dirname, '../../../database/01_schema.sql');
  const batches = fs.readFileSync(file, 'utf8').split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  for (const [i, b] of batches.entries()) {
    await db.request().batch(b);
    process.stdout.write(`\rApplying schema ${i + 1}/${batches.length}`);
  }
  await db.close();
  await applyMigrations();
  console.log('\nSchema applied. Next: npm run db:seed');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nDB init failed:', e?.message ?? e);
  process.exit(1);
});
