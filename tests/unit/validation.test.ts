import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSchema, uuidSchema } from '../../src/schemas/account.schema.js';
import { amountSchema, historySchema, transactionSchema } from '../../src/schemas/transaction.schema.js';
import { envSchema } from '../../src/config/env.js';

test('account names are trimmed; initial balance and system fields are forbidden', () => {
  assert.deepEqual(accountSchema.parse({ name: '  Jane  ' }), { name: 'Jane' });
  for (const body of [{}, { name: '' }, { name: ' ' }, { name: 'x'.repeat(256) }, { name: 1 }, { name: 'Jane', balance: 0 }, { name: 'Jane', id: 'client-id' }]) {
    assert.equal(accountSchema.safeParse(body).success, false);
  }
});
for (const value of ['0', '0.00', '-1', '1.234', 'abc', '1e2', 1, null, '1000000000000.00', '1'.repeat(101)]) {
  test(`amount validation rejects ${JSON.stringify(value)}`, () => assert.equal(amountSchema.safeParse(value).success, false));
}
test('amounts normalize to two decimal places', () => {
  assert.equal(amountSchema.parse('1'), '1.00');
  assert.equal(amountSchema.parse('0001.5'), '1.50');
  assert.equal(amountSchema.parse('999999999999.99'), '999999999999.99');
});
test('UUIDv4 canonicalization', () => {
  assert.equal(uuidSchema.parse('A98C8F8E-42C2-47E1-889B-82F534891BCA'), 'a98c8f8e-42c2-47e1-889b-82f534891bca');
  assert.equal(uuidSchema.safeParse('123').success, false);
  assert.equal(uuidSchema.safeParse('00000000-0000-0000-0000-000000000000').success, false);
});
test('strict transaction validation and optional description', () => {
  const input = { type: 'credit', amount: '1', reference_id: ' ref ' };
  assert.deepEqual(transactionSchema.parse(input), { type: 'credit', amount: '1.00', reference_id: 'ref', description: '' });
  for (const body of [{ ...input, type: 'wire' }, { ...input, reference_id: ' ' }, { ...input, reference_id: 'x'.repeat(101) }, { ...input, description: 'x'.repeat(501) }, { ...input, balance: '5' }]) assert.equal(transactionSchema.safeParse(body).success, false);
});
test('pagination rejects coercion surprises, repeated values and unknown parameters', () => {
  assert.deepEqual(historySchema.parse({ type: '' }), { type: undefined, page: 1, limit: 10 });
  for (const input of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1abc' }, { page: '1e2' }, { page: '' }, { page: '2147483648' }, { limit: '101' }, { page: ['1', '2'] }, { type: 'wire' }, { extra: 'x' }]) assert.equal(historySchema.safeParse(input).success, false);
});
test('environment configuration validates ports and origin lists', () => {
  const config = { DATABASE_URL: 'postgresql://ledger:secret@localhost:5433/ledger' };
  for (const PORT of ['3000abc', '0', '65536']) assert.equal(envSchema.safeParse({ ...config, PORT }).success, false);
  assert.equal(envSchema.safeParse({ ...config, CORS_ORIGIN: '*' }).success, false);
  assert.equal(envSchema.safeParse({ ...config, CORS_ORIGIN: 'http://localhost:3000,https://example.com' }).success, true);
});
