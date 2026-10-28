import { z } from 'zod';
import { centsToDecimalString, MAX_AMOUNT_CENTS, parseDecimalStringToCents } from '../utils/money.js';
export const amountSchema = z.string().max(100).superRefine((value, ctx) => {
  if (value.length > 100 || !/^\d+(\.\d{1,2})?$/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'Amount must be a decimal string with at most two decimal places' });
    return;
  }
  const cents = parseDecimalStringToCents(value);
  if (cents <= 0n || cents > MAX_AMOUNT_CENTS) ctx.addIssue({ code: 'custom', message: 'Amount must be between 0.01 and 999999999999.99' });
}).transform(value => centsToDecimalString(parseDecimalStringToCents(value)));
export const transactionSchema = z.object({
  type: z.enum(['credit', 'debit']), amount: amountSchema,
  reference_id: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
}).strict();
const queryInteger = (fallback: string, max: number) => z.string().regex(/^[1-9]\d*$/)
  .default(fallback).transform(Number).pipe(z.number().int().min(1).max(max));
export const historySchema = z.object({
  type: z.preprocess(value => value === '' ? undefined : value, z.enum(['credit', 'debit']).optional()),
  page: queryInteger('1', 2147483647), limit: queryInteger('10', 100),
}).strict();
