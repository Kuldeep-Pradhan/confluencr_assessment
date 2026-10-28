import type { Pool, PoolClient } from 'pg';
import type { Runtime } from '../types/index.js';

export function createTransactionRunner(pool: Pool, runtime: Runtime) {
  return async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    let client: PoolClient;
    try { client = await pool.connect(); }
    catch (error) { throw runtime.errors.fromDatabase(error); }
    let discard = false;
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        discard = true;
        runtime.logger.error({ err: rollbackError }, 'Database rollback failed; discarding connection');
      }
      throw runtime.errors.fromDatabase(error);
    } finally {
      client.release(discard);
    }
  };
}
