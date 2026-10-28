import type { Database } from '../db/pool.js';
import type { AccountRepository } from '../repositories/account.repository.js';
import type { TransactionRepository } from '../repositories/transaction.repository.js';
import type { HistoryInput, Runtime, TransactionInput } from '../types/index.js';
import { MAX_BALANCE_CENTS, parseDecimalStringToCents } from '../utils/money.js';

export function createTransactionService(db: Database, accounts: AccountRepository, transactions: TransactionRepository, runtime: Runtime) {
  return {
    create(accountId: string, input: TransactionInput) {
      return db.withTransaction(async client => {
        const account = await accounts.lock(accountId, client);
        if (!account) throw new runtime.errors.NotFoundError();
        // Check duplicate before funds: replaying a successful debit must ALWAYS return 409,
        // even if that original debit consumed the account's remaining funds.
        if (await transactions.referenceExists(accountId, input.reference_id, client)) throw new runtime.errors.DuplicateTransactionError();
        const amount = parseDecimalStringToCents(input.amount);
        const balance = parseDecimalStringToCents(account.balance);
        if (input.type === 'debit' && balance < amount) throw new runtime.errors.InsufficientFundsError();
        if (input.type === 'credit' && balance + amount > MAX_BALANCE_CENTS) throw new runtime.errors.BalanceLimitError();
        const currentBalance = await accounts.changeBalance(accountId, input.amount, input.type, client);
        const transaction = await transactions.create(accountId, input, client);
        return { ...transaction, current_balance: currentBalance };
      });
    },
    history(accountId: string, input: HistoryInput) {
      // Account existence, count, and page all observe the SAME database snapshot.
      return db.withTransaction(async client => {
        if (!await accounts.find(accountId, client)) throw new runtime.errors.NotFoundError();
        return transactions.history(accountId, input, client);
      }, true);
    },
  };
}
export type TransactionService = ReturnType<typeof createTransactionService>;
