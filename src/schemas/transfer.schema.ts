import { z } from 'zod';
import { uuidSchema } from './account.schema.js';
import { amountSchema } from './transaction.schema.js';
export const transferSchema = z.object({
  source_account_id: uuidSchema, destination_account_id: uuidSchema,
  amount: amountSchema, reference_id: z.string().trim().min(1).max(96),
  description: z.string().trim().max(440).default(''),
}).strict().superRefine((input, ctx) => {
  if (input.source_account_id === input.destination_account_id) ctx.addIssue({ code: 'custom', path: ['destination_account_id'], message: 'Source and destination accounts must be different' });
});
export type TransferInput = z.infer<typeof transferSchema>;
