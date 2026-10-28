import type { Database } from '../db/pool.js';
import type { AccountRepository } from '../repositories/account.repository.js';
import type { TransactionRepository } from '../repositories/transaction.repository.js';
import type { TransferRepository } from '../repositories/transfer.repository.js';
import type { TransferInput } from '../schemas/transfer.schema.js';
import type { Runtime } from '../types/index.js';
import { MAX_BALANCE_CENTS, parseDecimalStringToCents } from '../utils/money.js';

export function createTransferService(db: Database, accounts: AccountRepository, transactions: TransactionRepository, transfers: TransferRepository, runtime: Runtime) {
  return {
    create(input: TransferInput) {
      return db.withTransaction(async client => {
        if (input.source_account_id === input.destination_account_id) throw new runtime.errors.ValidationError([], 'Source and destination accounts must be different');
        const [firstId, secondId] = [input.source_account_id, input.destination_account_id].sort();
        const first = await accounts.lock(firstId!, client);
        const second = await accounts.lock(secondId!, client);
        if (!first || !second) throw new runtime.errors.NotFoundError('Source or destination account not found');
        const source = first.id === input.source_account_id ? first : second;
        const destination = first.id === input.destination_account_id ? first : second;
        if (await transfers.referenceExists(input.reference_id, client)) throw new runtime.errors.DuplicateTransferError();
        const sourceReference = `${input.reference_id}-out`;
        const destinationReference = `${input.reference_id}-in`;
        if (await transactions.referenceExists(source.id, sourceReference, client) || await transactions.referenceExists(destination.id, destinationReference, client)) throw new runtime.errors.DuplicateTransactionError();
        const amount = parseDecimalStringToCents(input.amount);
        if (parseDecimalStringToCents(source.balance) < amount) throw new runtime.errors.InsufficientFundsError();
        if (parseDecimalStringToCents(destination.balance) + amount > MAX_BALANCE_CENTS) throw new runtime.errors.BalanceLimitError();
        const sourceBalance = await accounts.changeBalance(source.id, input.amount, 'debit', client);
        const destinationBalance = await accounts.changeBalance(destination.id, input.amount, 'credit', client);
        const sourceTransaction = await transactions.create(source.id, {
          type: 'debit', amount: input.amount, reference_id: sourceReference,
          description: `Transfer to account ${destination.id}: ${input.description}`,
        }, client);
        const destinationTransaction = await transactions.create(destination.id, {
          type: 'credit', amount: input.amount, reference_id: destinationReference,
          description: `Transfer from account ${source.id}: ${input.description}`,
        }, client);
        const transfer = await transfers.create(input, sourceTransaction.id, destinationTransaction.id, client);
        return { ...transfer, source_balance: sourceBalance, destination_balance: destinationBalance };
      });
    },
  };
}
export type TransferService = ReturnType<typeof createTransferService>;
