import type { PoolClient } from 'pg';
import type { TransferInput } from '../schemas/transfer.schema.js';
interface Transfer {
  id: string; source_account_id: string; destination_account_id: string; amount: string;
  source_transaction_id: string; destination_transaction_id: string; reference_id: string; created_at: Date;
}
export function createTransferRepository() {
  return {
    async referenceExists(reference: string, client: PoolClient) {
      const result = await client.query('SELECT 1 FROM transfers WHERE reference_id = $1', [reference]);
      return result.rows.length > 0;
    },
    async create(input: TransferInput, sourceTransactionId: string, destinationTransactionId: string, client: PoolClient): Promise<Transfer> {
      const result = await client.query<Transfer>(`INSERT INTO transfers
        (source_account_id, destination_account_id, amount, source_transaction_id, destination_transaction_id, reference_id)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, source_account_id, destination_account_id, amount,
        source_transaction_id, destination_transaction_id, reference_id, created_at`,
      [input.source_account_id, input.destination_account_id, input.amount, sourceTransactionId, destinationTransactionId, input.reference_id]);
      return result.rows[0]!;
    },
  };
}
export type TransferRepository = ReturnType<typeof createTransferRepository>;
