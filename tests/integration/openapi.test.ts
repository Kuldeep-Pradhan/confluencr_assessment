import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../../src/db/migration-runner.js';
import { addTransaction, createAccount, createIntegrationApp } from '../helpers.js';
import { assertMatches } from '../openapi-contract.js';

const app = createIntegrationApp();
before(async () => { await runMigrations(app.locals.db.pool); });
after(() => app.locals.db.close());
test('real success responses for every JSON endpoint match the published OpenAPI schemas', async () => {
  const created = await request(app).post('/api/v1/accounts').send({ name: 'Contract Account' }).expect(201);
  assertMatches('/api/v1/accounts', 'post', 201, created.body);
  const id = created.body.data.id as string;
  const credit = await addTransaction(app, id, 'credit', '10').expect(201);
  assertMatches('/api/v1/accounts/{accountId}/transactions', 'post', 201, credit.body);
  const balance = await request(app).get(`/api/v1/accounts/${id}/balance`).expect(200);
  assertMatches('/api/v1/accounts/{accountId}/balance', 'get', 200, balance.body);
  const history = await request(app).get(`/api/v1/accounts/${id}/transactions`).expect(200);
  assertMatches('/api/v1/accounts/{accountId}/transactions', 'get', 200, history.body);
  const destination = await createAccount(app);
  const transfer = await request(app).post('/api/v1/transfers').send({ source_account_id: id, destination_account_id: destination, amount: '1', reference_id: randomUUID() }).expect(201);
  assertMatches('/api/v1/transfers', 'post', 201, transfer.body);
  for (const path of ['/health', '/health/ready', '/api/v1']) {
    const res = await request(app).get(path).expect(200);
    assertMatches(path, 'get', 200, res.body);
  }
});
test('real validation, missing account, duplicate, insufficient funds, body-size and media errors match OpenAPI', async () => {
  const id = await createAccount(app);
  const invalid = await request(app).post('/api/v1/accounts').send({ name: 'contract', balance: 1 }).expect(400);
  assertMatches('/api/v1/accounts', 'post', 400, invalid.body);
  const missing = await request(app).get(`/api/v1/accounts/${randomUUID()}/balance`).expect(404);
  assertMatches('/api/v1/accounts/{accountId}/balance', 'get', 404, missing.body);
  await addTransaction(app, id, 'credit', '1', 'contract-ref').expect(201);
  const duplicate = await addTransaction(app, id, 'credit', '1', 'contract-ref').expect(409);
  assertMatches('/api/v1/accounts/{accountId}/transactions', 'post', 409, duplicate.body);
  const insufficient = await addTransaction(app, id, 'debit', '2').expect(422);
  assertMatches('/api/v1/accounts/{accountId}/transactions', 'post', 422, insufficient.body);
  const large = await request(app).post('/api/v1/accounts').send({ name: 'x'.repeat(11000) }).expect(413);
  assertMatches('/api/v1/accounts', 'post', 413, large.body);
  const media = await request(app).post('/api/v1/accounts').send('not json').expect(415);
  assertMatches('/api/v1/accounts', 'post', 415, media.body);
});
test('Swagger UI and downloadable specification are served and contain the current API', async () => {
  const ui = await request(app).get('/api/v1/docs/').expect(200);
  assert.match(ui.headers['content-type'] ?? '', /text\/html/);
  assert.match(ui.text, /swagger-ui/);
  const spec = await request(app).get('/api/v1/openapi.yaml').expect(200);
  assert.match(spec.headers['content-type'] ?? '', /application\/yaml/);
  assert.match(spec.text, /openapi: 3\.1\.0/);
  assert.match(spec.text, /\/api\/v1\/transfers/);
  await request(app).get('/api/v1/docs/swagger-ui-bundle.js').expect(200);
});
