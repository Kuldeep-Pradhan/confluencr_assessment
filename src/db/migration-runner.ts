import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function runMigrations(pool: Pool): Promise<string[]> {
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    // Serialize concurrent migration runners using a transaction-scoped lock.
    await client.query('SELECT pg_advisory_xact_lock(724019830)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const applied = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations');
    const known = new Map(applied.rows.map(row => [row.name, row.checksum]));
    const executed: string[] = [];
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (known.has(file)) {
        if (known.get(file) !== checksum) throw new Error(`Applied migration was modified: ${file}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
      executed.push(file);
    }
    await client.query('COMMIT');
    return executed;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
