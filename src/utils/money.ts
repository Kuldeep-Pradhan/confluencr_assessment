export const MAX_AMOUNT_CENTS = 99999999999999n; // Explicit request cap in the plan.
export const MAX_BALANCE_CENTS = 999999999999999n; // NUMERIC(15, 2): 13 integer digits.
export function parseDecimalStringToCents(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new RangeError('Invalid decimal string');
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function centsToDecimalString(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
