import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import { createApp } from '../../src/app.js';
import { envSchema } from '../../src/config/env.js';
import { createTransactionRunner } from '../../src/db/transaction.js';

const app = createApp({ config: envSchema.parse({ DATABASE_URL: 'postgresql://unit:unit@localhost:1/unit_test', LOG_LEVEL: 'silent' }) });
after(() => app.locals.db.close());
const runtime = app.locals.runtime;
test('rollback failure discards client and preserves the original domain error', async () => {
  const calls: string[] = [];
  let discard: boolean | undefined;
  const client = { query: async (sql: string) => { calls.push(sql); if (sql === 'ROLLBACK') throw new Error('socket lost'); },
    release: (value: boolean) => { discard = value; } } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  const original = new runtime.errors.InsufficientFundsError();
  await assert.rejects(createTransactionRunner(pool, runtime)(async () => { throw original; }), error => error === original);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
  assert.equal(discard, true);
});
test('success uses one client, commits, and releases', async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => { calls.push(sql); }, release: () => { calls.push('release'); } } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  assert.equal(await createTransactionRunner(pool, runtime)(async checkedOut => { assert.equal(checkedOut, client); return 'ok'; }), 'ok');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'release']);
});
test('database errors extend BaseError and expose no SQL internals', () => {
  const error = runtime.errors.fromDatabase(new Error('secret SQL details'));
  assert.ok(error instanceof runtime.errors.BaseError);
  assert.ok(error instanceof runtime.errors.DbError);
  assert.equal(error.message, 'A database operation failed');
});
test('known database constraint errors become the correct domain subclasses', () => {
  assert.ok(runtime.errors.fromDatabase({ code: '23505', constraint: 'uq_account_reference' }) instanceof runtime.errors.DuplicateTransactionError);
  assert.ok(runtime.errors.fromDatabase({ code: '23505', constraint: 'unrelated_unique' }) instanceof runtime.errors.DbError);
});
