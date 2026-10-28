import { Pool, type QueryResultRow } from 'pg';
import type { Env } from '../config/env.js';
import type { Runtime } from '../types/index.js';
import { createTransactionRunner } from './transaction.js';

export function createDatabase(config: Env, runtime: Runtime, existingPool?: Pool) {
  const pool = existingPool ?? new Pool({
    connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    application_name: 'transaction-ledger-service',
  });
  pool.on('error', error => runtime.logger.error({ err: error }, 'Idle database connection failed'));
  return {
    pool,
    async query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
      try { return await pool.query<T>(sql, values); }
      catch (error) { throw runtime.errors.fromDatabase(error); }
    },
    withTransaction: createTransactionRunner(pool, runtime),
    close: () => pool.end(),
  };
}
export type Database = ReturnType<typeof createDatabase>;
