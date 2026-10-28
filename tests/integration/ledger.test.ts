import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { runMigrations } from '../../src/db/migration-runner.js';
import { addTransaction, createAccount, createIntegrationApp, getBalance, reconcile } from '../helpers.js';

const app = createIntegrationApp();
before(async () => { await runMigrations(app.locals.db.pool); });
after(() => app.locals.db.close());
const txPath = (id: string) => `/api/v1/accounts/${id}/transactions`;

test('migrations are idempotent, including concurrent runners', async () => {
  const results = await Promise.all([runMigrations(app.locals.db.pool), runMigrations(app.locals.db.pool)]);
  assert.deepEqual(results, [[], []]);
});
test('create account generates UUIDv4, timestamps and zero balance; balance endpoint agrees', async () => {
  const res = await request(app).post('/api/v1/accounts').send({ name: '  Jane Doe  ' }).expect(201);
  assert.equal(res.body.data.name, 'Jane Doe');
  assert.equal(res.body.data.balance, '0.00');
  assert.match(res.body.data.id, /^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
  assert.ok(Number.isFinite(Date.parse(res.body.data.created_at)));
  assert.equal(await getBalance(app, res.body.data.id), '0.00');
});
for (const body of [{}, { name: '' }, { name: ' ' }, { name: 10 }, { name: 'a'.repeat(256) }, { name: 'Jane', balance: '500.00' }, { name: 'Jane', created_at: 'client-time' }, { name: 'Jane', id: randomUUID() }]) {
  test(`account rejects invalid/system-controlled fields ${JSON.stringify(body).slice(0, 70)}`, async () => {
    const res = await request(app).post('/api/v1/accounts').send(body).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.length > 0);
  });
}
test('missing account returns 404 on balance, transactions and history', async () => {
  const id = randomUUID();
  for (const res of [await request(app).get(`/api/v1/accounts/${id}/balance`), await request(app).get(txPath(id)), await addTransaction(app, id, 'credit', '1')]) {
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ACCOUNT_NOT_FOUND');
  }
});
test('malformed account UUID returns 400 on all account-specific endpoints', async () => {
  for (const res of [await request(app).get('/api/v1/accounts/abc/balance'), await request(app).get(txPath('abc')), await addTransaction(app, 'abc', 'credit', '1')]) {
    assert.equal(res.status, 400); assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});
test('credits and debits produce immutable records and exact balances', async () => {
  const id = await createAccount(app);
  const credit = await addTransaction(app, id, 'credit', '100.50', 'credit').expect(201);
  assert.equal(credit.body.data.current_balance, '100.50');
  assert.equal(credit.body.data.amount, '100.50');
  assert.equal(credit.body.data.account_id, id);
  assert.equal(credit.body.data.description, '');
  const debit = await addTransaction(app, id, 'debit', '30.25', 'debit').expect(201);
  assert.equal(debit.body.data.current_balance, '70.25');
  assert.equal(await getBalance(app, id), '70.25');
  await reconcile(app, id);
});
test('fractional credits never lose precision', async () => {
  const id = await createAccount(app);
  await addTransaction(app, id, 'credit', '0.1').expect(201);
  await addTransaction(app, id, 'credit', '0.2').expect(201);
  assert.equal(await getBalance(app, id), '0.30');
  await reconcile(app, id);
});
test('insufficient debit leaves both ledger and balance unchanged', async () => {
  const id = await createAccount(app);
  await addTransaction(app, id, 'credit', '10').expect(201);
  const res = await addTransaction(app, id, 'debit', '10.01').expect(422);
  assert.equal(res.body.error.code, 'INSUFFICIENT_FUNDS');
  assert.equal(await getBalance(app, id), '10.00');
  const history = await request(app).get(txPath(id)).expect(200);
  assert.equal(history.body.data.pagination.total_records, 1);
  await reconcile(app, id);
});
for (const amount of ['0', '0.00', '-25.00', '10.555', 'abc', '1e2', 10, null, '1000000000000.00']) {
  test(`API rejects invalid amount ${JSON.stringify(amount)}`, async () => {
    const id = await createAccount(app);
    const res = await request(app).post(txPath(id)).send({ type: 'credit', amount, reference_id: 'invalid' }).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(await getBalance(app, id), '0.00');
  });
}
test('invalid transaction type, reference, description, and unknown fields are rejected', async () => {
  const id = await createAccount(app);
  const valid = { type: 'credit', amount: '1', reference_id: 'valid' };
  for (const body of [{ ...valid, type: 'wire' }, { type: 'credit', amount: '1' }, { ...valid, reference_id: ' ' }, { ...valid, reference_id: 'r'.repeat(101) }, { ...valid, description: 'd'.repeat(501) }, { ...valid, balance: '2' }]) {
    const res = await request(app).post(txPath(id)).send(body).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});
test('duplicate reference rejects retries and changed payloads, including exhausted debit', async () => {
  const id = await createAccount(app);
  await addTransaction(app, id, 'credit', '10', 'seed').expect(201);
  await addTransaction(app, id, 'debit', '10', 'retry').expect(201);
  const repeated = await addTransaction(app, id, 'debit', '10', 'retry').expect(409);
  assert.equal(repeated.body.error.code, 'DUPLICATE_TRANSACTION');
  await addTransaction(app, id, 'credit', '999', 'retry').expect(409);
  assert.equal(await getBalance(app, id), '0.00');
  await reconcile(app, id);
});
test('same reference is valid on different accounts', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '1', 'same-ref').expect(201);
  await addTransaction(app, b, 'credit', '2', 'same-ref').expect(201);
  assert.equal(await getBalance(app, a), '1.00');
  assert.equal(await getBalance(app, b), '2.00');
});
test('concurrent duplicate requests result in exactly one committed credit', async () => {
  const id = await createAccount(app);
  const results = await Promise.all(Array.from({ length: 10 }, () => addTransaction(app, id, 'credit', '10', 'concurrent')));
  assert.equal(results.filter(res => res.status === 201).length, 1);
  assert.equal(results.filter(res => res.status === 409).length, 9);
  assert.equal(await getBalance(app, id), '10.00');
  await reconcile(app, id);
});
test('ten concurrent debits cannot overdraw', async () => {
  const id = await createAccount(app);
  await addTransaction(app, id, 'credit', '30').expect(201);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => addTransaction(app, id, 'debit', '10', `debit-${i}`)));
  assert.equal(results.filter(res => res.status === 201).length, 3);
  assert.equal(results.filter(res => res.status === 422).length, 7);
  assert.equal(await getBalance(app, id), '0.00');
  await reconcile(app, id);
});
test('concurrent credits are not lost', async () => {
  const id = await createAccount(app);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => addTransaction(app, id, 'credit', '0.01', `credit-${i}`)));
  assert.ok(results.every(res => res.status === 201));
  assert.equal(await getBalance(app, id), '0.20');
  await reconcile(app, id);
});
test('real database failure after balance update rolls back and hides database internals', async () => {
  const id = await createAccount(app);
  const marker = randomUUID();
  const name = `test_fail_${marker.replaceAll('-', '')}`;
  const pool = app.locals.db.pool;
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.reference_id = '${marker}' THEN RAISE EXCEPTION 'injected private SQL error'; END IF;
    RETURN NEW; END; $$`);
  try {
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    const res = await addTransaction(app, id, 'credit', '10', marker).expect(500);
    assert.equal(res.body.error.code, 'DATABASE_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('private SQL'));
    assert.equal(await getBalance(app, id), '0.00');
    const history = await request(app).get(txPath(id)).expect(200);
    assert.equal(history.body.data.pagination.total_records, 0);
    await reconcile(app, id);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON transactions`);
    await pool.query(`DROP FUNCTION ${name}()`);
  }
});
test('history filters, defaults, pagination and out-of-range counts', async () => {
  const id = await createAccount(app);
  await addTransaction(app, id, 'credit', '100').expect(201);
  await addTransaction(app, id, 'debit', '10').expect(201);
  await addTransaction(app, id, 'credit', '20').expect(201);
  const full = await request(app).get(txPath(id)).expect(200);
  assert.deepEqual(full.body.data.pagination, { current_page: 1, page_size: 10, total_records: 3, total_pages: 1 });
  const emptyType = await request(app).get(txPath(id)).query({ type: '' }).expect(200);
  assert.equal(emptyType.body.data.transactions.length, 3);
  for (const type of ['credit', 'debit']) {
    const res = await request(app).get(txPath(id)).query({ type, page: 1, limit: 1 }).expect(200);
    assert.ok(res.body.data.transactions.every((tx: { type: string }) => tx.type === type));
    assert.equal(res.body.data.pagination.total_records, type === 'credit' ? 2 : 1);
  }
  const second = await request(app).get(txPath(id)).query({ page: 2, limit: 2 }).expect(200);
  assert.equal(second.body.data.transactions.length, 1);
  assert.equal(second.body.data.pagination.total_pages, 2);
  const out = await request(app).get(txPath(id)).query({ page: 999, limit: 2 }).expect(200);
  assert.deepEqual(out.body.data.transactions, []);
  assert.deepEqual(out.body.data.pagination, { current_page: 999, page_size: 2, total_records: 3, total_pages: 2 });
});
test('empty history has accurate zero totals', async () => {
  const id = await createAccount(app);
  const res = await request(app).get(txPath(id)).expect(200);
  assert.deepEqual(res.body.data.transactions, []);
  assert.equal(res.body.data.pagination.total_records, 0);
  assert.equal(res.body.data.pagination.total_pages, 0);
});
test('history is latest-first with deterministic UUID order for equal timestamps', async () => {
  const id = await createAccount(app);
  await app.locals.db.withTransaction(async client => {
    await client.query('UPDATE accounts SET balance = 3 WHERE id = $1', [id]);
    for (let i = 0; i < 3; i++) await client.query("INSERT INTO transactions (account_id, type, amount, reference_id) VALUES ($1, 'credit', 1, $2)", [id, `tie-${i}`]);
  });
  const res = await request(app).get(txPath(id)).expect(200);
  const rows = res.body.data.transactions as { id: string; created_at: string }[];
  assert.equal(new Set(rows.map(row => row.created_at)).size, 1);
  assert.deepEqual(rows.map(row => row.id), rows.map(row => row.id).sort().reverse());
  await reconcile(app, id);
});
for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=abc', 'limit=0', 'limit=101', 'type=wire', 'page=1&page=2', 'type=credit&type=debit', 'unknown=x']) {
  test(`history rejects invalid pagination/filter ${query}`, async () => {
    const id = await createAccount(app);
    const res = await request(app).get(`${txPath(id)}?${query}`).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
}
test('ledger cannot be edited or deleted through API or SQL', async () => {
  const id = await createAccount(app);
  const created = await addTransaction(app, id, 'credit', '1').expect(201);
  for (const method of ['put', 'patch', 'delete'] as const) {
    await request(app)[method](txPath(id)).send({ amount: '2' }).expect(404);
    await request(app)[method](`${txPath(id)}/${created.body.data.id}`).send({ amount: '2' }).expect(404);
  }
  await assert.rejects(app.locals.db.pool.query('UPDATE transactions SET amount = 2 WHERE id = $1', [created.body.data.id]), /immutable/);
  await assert.rejects(app.locals.db.pool.query('DELETE FROM transactions WHERE id = $1', [created.body.data.id]), /immutable/);
  assert.equal(await getBalance(app, id), '1.00');
  await reconcile(app, id);
});
test('malformed JSON, missing body, primitive body, oversized body and content type use standard errors', async () => {
  for (const payload of ['{bad', 'null', '[]', '"string"']) {
    const res = await request(app).post('/api/v1/accounts').set('Content-Type', 'application/json').send(payload).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  await request(app).post('/api/v1/accounts').set('Content-Type', 'application/json').expect(400);
  const large = await request(app).post('/api/v1/accounts').send({ name: 'x'.repeat(11000) }).expect(413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
  const unsupported = await request(app).post('/api/v1/accounts').set('Content-Type', 'text/plain').send('name=Jane').expect(415);
  assert.equal(unsupported.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
});
test('large exact amounts and cumulative balance overflow are handled atomically', async () => {
  const id = await createAccount(app);
  for (let i = 0; i < 10; i++) await addTransaction(app, id, 'credit', '999999999999.99').expect(201);
  assert.equal(await getBalance(app, id), '9999999999999.90');
  const overflow = await addTransaction(app, id, 'credit', '0.10').expect(422);
  assert.equal(overflow.body.error.code, 'BALANCE_LIMIT_EXCEEDED');
  assert.equal(await getBalance(app, id), '9999999999999.90');
  await reconcile(app, id);
});
test('operational endpoints report live PostgreSQL readiness and API metadata', async () => {
  const ready = await request(app).get('/health/ready').expect(200);
  assert.equal(ready.body.data.database, 'UP');
  const root = await request(app).get('/api/v1').expect(200);
  assert.equal(root.body.data.documentation, '/api/v1/docs');
});
