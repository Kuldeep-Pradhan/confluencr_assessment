import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { runMigrations } from '../../src/db/migration-runner.js';
import { addTransaction, createAccount, createIntegrationApp, getBalance, reconcile } from '../helpers.js';

const app = createIntegrationApp();
before(async () => { await runMigrations(app.locals.db.pool); });
after(() => app.locals.db.close());
function transfer(source: string, destination: string, amount: string, reference: string = randomUUID(), description = '') {
  return request(app).post('/api/v1/transfers').send({ source_account_id: source, destination_account_id: destination, amount, reference_id: reference, description });
}
test('successful transfer updates both balances, ledger entries and audit journal atomically', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '100').expect(201);
  await addTransaction(app, b, 'credit', '50').expect(201);
  const ref = randomUUID();
  const res = await transfer(a, b, '30', ref, 'Vendor settlement').expect(201);
  assert.equal(res.body.data.source_balance, '70.00');
  assert.equal(res.body.data.destination_balance, '80.00');
  assert.equal(res.body.data.amount, '30.00');
  const rows = await app.locals.db.pool.query('SELECT * FROM transactions WHERE id = ANY($1::uuid[])', [[res.body.data.source_transaction_id, res.body.data.destination_transaction_id]]);
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows.find(row => row.account_id === a)?.reference_id, `${ref}-out`);
  assert.equal(rows.rows.find(row => row.account_id === b)?.reference_id, `${ref}-in`);
  assert.equal(rows.rows.find(row => row.account_id === a)?.type, 'debit');
  assert.equal(rows.rows.find(row => row.account_id === b)?.type, 'credit');
  await reconcile(app, a); await reconcile(app, b);
});
test('self transfers reject normalized UUIDs including differently cased input', async () => {
  const id = await createAccount(app);
  const res = await transfer(id, id.toUpperCase(), '1').expect(400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});
test('missing source or destination returns 404', async () => {
  const id = await createAccount(app);
  for (const [a, b] of [[randomUUID(), id], [id, randomUUID()], [randomUUID(), randomUUID()]]) {
    const res = await transfer(a!, b!, '1').expect(404);
    assert.equal(res.body.error.code, 'ACCOUNT_NOT_FOUND');
  }
});
test('insufficient source balance changes neither account', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '10').expect(201);
  const res = await transfer(a, b, '10.01').expect(422);
  assert.equal(res.body.error.code, 'INSUFFICIENT_FUNDS');
  assert.equal(await getBalance(app, a), '10.00');
  assert.equal(await getBalance(app, b), '0.00');
  await reconcile(app, a); await reconcile(app, b);
});
test('duplicate transfer is rejected even after source is exhausted', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '10').expect(201);
  const ref = randomUUID();
  await transfer(a, b, '10', ref).expect(201);
  const res = await transfer(a, b, '10', ref).expect(409);
  assert.equal(res.body.error.code, 'DUPLICATE_TRANSFER');
  assert.equal(await getBalance(app, a), '0.00'); assert.equal(await getBalance(app, b), '10.00');
});
test('concurrent duplicate transfers commit exactly once', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '100').expect(201);
  const ref = randomUUID();
  const results = await Promise.all(Array.from({ length: 10 }, () => transfer(a, b, '10', ref)));
  assert.equal(results.filter(res => res.status === 201).length, 1);
  assert.equal(results.filter(res => res.status === 409).length, 9);
  assert.equal(await getBalance(app, a), '90.00'); assert.equal(await getBalance(app, b), '10.00');
  await reconcile(app, a); await reconcile(app, b);
});
test('transfer reference is globally unique across disjoint account pairs', async () => {
  const ids = await Promise.all(Array.from({ length: 4 }, () => createAccount(app)));
  await addTransaction(app, ids[0]!, 'credit', '10').expect(201);
  await addTransaction(app, ids[2]!, 'credit', '10').expect(201);
  const ref = randomUUID();
  const results = await Promise.all([transfer(ids[0]!, ids[1]!, '5', ref), transfer(ids[2]!, ids[3]!, '5', ref)]);
  assert.deepEqual(results.map(res => res.status).sort(), [201, 409]);
  assert.equal(results.find(res => res.status === 409)?.body.error.code, 'DUPLICATE_TRANSFER');
  for (const id of ids) await reconcile(app, id);
  const balances = await Promise.all(ids.map(id => getBalance(app, id)));
  assert.equal(balances.filter(value => value === '5.00').length, 2);
  assert.equal(balances.filter(value => value === '10.00').length, 1);
  assert.equal(balances.filter(value => value === '0.00').length, 1);
});
test('opposing transfers acquire ordered locks without deadlocks', { timeout: 15000 }, async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '100').expect(201);
  await addTransaction(app, b, 'credit', '100').expect(201);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => i % 2 === 0 ? transfer(a, b, '1') : transfer(b, a, '1')));
  assert.ok(results.every(res => res.status === 201));
  assert.equal(await getBalance(app, a), '100.00'); assert.equal(await getBalance(app, b), '100.00');
  await reconcile(app, a); await reconcile(app, b);
});
test('concurrent transfers cannot overdraw source', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '30').expect(201);
  const results = await Promise.all(Array.from({ length: 10 }, () => transfer(a, b, '10')));
  assert.equal(results.filter(res => res.status === 201).length, 3);
  assert.equal(results.filter(res => res.status === 422).length, 7);
  assert.equal(await getBalance(app, a), '0.00'); assert.equal(await getBalance(app, b), '30.00');
  await reconcile(app, a); await reconcile(app, b);
});
test('failure at final audit insert rolls back both balances and both ledger entries', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '10').expect(201);
  const marker = randomUUID(), name = `test_transfer_fail_${marker.replaceAll('-', '')}`;
  const pool = app.locals.db.pool;
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.reference_id = '${marker}' THEN RAISE EXCEPTION 'private injected transfer failure'; END IF;
    RETURN NEW; END; $$`);
  try {
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON transfers FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    const res = await transfer(a, b, '5', marker).expect(500);
    assert.equal(res.body.error.code, 'DATABASE_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('private injected'));
    assert.equal(await getBalance(app, a), '10.00'); assert.equal(await getBalance(app, b), '0.00');
    const ledger = await pool.query('SELECT 1 FROM transactions WHERE reference_id = ANY($1::text[])', [[`${marker}-out`, `${marker}-in`]]);
    assert.equal(ledger.rows.length, 0);
    const audit = await pool.query('SELECT 1 FROM transfers WHERE reference_id = $1', [marker]);
    assert.equal(audit.rows.length, 0);
    await reconcile(app, a); await reconcile(app, b);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON transfers`);
    await pool.query(`DROP FUNCTION ${name}()`);
  }
});
test('collision with a normal transaction reference rejects transfer without partial changes', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '10').expect(201);
  const ref = randomUUID();
  await addTransaction(app, b, 'credit', '1', `${ref}-in`).expect(201);
  const res = await transfer(a, b, '5', ref).expect(409);
  assert.equal(res.body.error.code, 'DUPLICATE_TRANSACTION');
  assert.equal(await getBalance(app, a), '10.00'); assert.equal(await getBalance(app, b), '1.00');
  await reconcile(app, a); await reconcile(app, b);
});
test('transfer validates all inputs and approved length boundaries', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '10').expect(201);
  const body = { source_account_id: a, destination_account_id: b, amount: '1', reference_id: 'valid' };
  for (const invalid of [{ ...body, reference_id: 'r'.repeat(97) }, { ...body, description: 'd'.repeat(441) }, { ...body, amount: 1 }, { ...body, amount: '0' }, { ...body, source_account_id: 'bad' }, { ...body, extra: 'x' }, { source_account_id: a, destination_account_id: b, amount: '1' }]) {
    const res = await request(app).post('/api/v1/transfers').send(invalid).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  // Use a unique value because the integration database is intentionally persistent.
  await transfer(a, b, '1', `r`.repeat(60) + randomUUID(), 'd'.repeat(440)).expect(201);
  await reconcile(app, a); await reconcile(app, b);
});
test('destination overflow rejects transfer without partial debit', async () => {
  const a = await createAccount(app), b = await createAccount(app);
  await addTransaction(app, a, 'credit', '10').expect(201);
  for (let i = 0; i < 10; i++) await addTransaction(app, b, 'credit', '999999999999.99').expect(201);
  const res = await transfer(a, b, '1').expect(422);
  assert.equal(res.body.error.code, 'BALANCE_LIMIT_EXCEEDED');
  assert.equal(await getBalance(app, a), '10.00'); assert.equal(await getBalance(app, b), '9999999999999.90');
  await reconcile(app, a); await reconcile(app, b);
});
