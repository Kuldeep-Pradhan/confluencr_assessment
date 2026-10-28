import test from 'node:test';
import assert from 'node:assert/strict';
import { centsToDecimalString, parseDecimalStringToCents } from '../../src/utils/money.js';

test('decimal arithmetic is exact for 0.1 + 0.2', () => {
  assert.equal(centsToDecimalString(parseDecimalStringToCents('0.1') + parseDecimalStringToCents('0.2')), '0.30');
});
test('large values are exact and canonicalized without Number arithmetic', () => {
  assert.equal(parseDecimalStringToCents('9999999999999.99'), 999999999999999n);
  assert.equal(centsToDecimalString(parseDecimalStringToCents('0000001.5')), '1.50');
  assert.equal(centsToDecimalString(-1n), '-0.01');
  assert.equal(centsToDecimalString(0n), '0.00');
});
for (const value of ['-1', '1.001', 'abc', '1e2', '', '.50', ' 1']) {
  test(`money utility rejects invalid input ${JSON.stringify(value)}`, () => assert.throws(() => parseDecimalStringToCents(value), RangeError));
}
