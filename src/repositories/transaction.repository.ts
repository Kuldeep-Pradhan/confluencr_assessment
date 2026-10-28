import type { PoolClient } from 'pg';
import type { HistoryInput, LedgerTransaction, TransactionInput } from '../types/index.js';

export function createTransactionRepository() {
  return {
    async create(accountId: string, input: TransactionInput, client: PoolClient): Promise<LedgerTransaction> {
      const result = await client.query<LedgerTransaction>(`INSERT INTO transactions (account_id, type, amount, description, reference_id)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, account_id, type, amount, description, reference_id, created_at`,
      [accountId, input.type, input.amount, input.description, input.reference_id]);
      return result.rows[0]!;
    },
    async referenceExists(accountId: string, reference: string, client: PoolClient): Promise<boolean> {
      const result = await client.query('SELECT 1 FROM transactions WHERE account_id = $1 AND reference_id = $2', [accountId, reference]);
      return result.rows.length > 0;
    },
    async history(accountId: string, input: HistoryInput, client: PoolClient) {
      const values: unknown[] = [accountId];
      let filter = 'account_id = $1';
      if (input.type) { values.push(input.type); filter += ' AND type = $2'; }
      const count = await client.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM transactions WHERE ${filter}`, values);
      const offset = (input.page - 1) * input.limit;
      const rows = await client.query<LedgerTransaction>(`SELECT id, account_id, type, amount, description, reference_id, created_at
        FROM transactions WHERE ${filter} ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, input.limit, offset]);
      const total = count.rows[0]!.total;
      return { transactions: rows.rows, pagination: {
        current_page: input.page, page_size: input.limit, total_records: total, total_pages: Math.ceil(total / input.limit),
      } };
    },
  };
}
export type TransactionRepository = ReturnType<typeof createTransactionRepository>;
