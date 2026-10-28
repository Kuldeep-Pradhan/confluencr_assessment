import type { PoolClient } from 'pg';
import type { Database } from '../db/pool.js';
import type { Account, TransactionType } from '../types/index.js';

export function createAccountRepository(db: Database) {
  return {
    async create(name: string): Promise<Account> {
      const result = await db.query<Account>('INSERT INTO accounts (name) VALUES ($1) RETURNING id, name, balance, created_at', [name]);
      return result.rows[0]!;
    },
    async find(id: string, client?: PoolClient): Promise<Account | undefined> {
      const sql = 'SELECT id, name, balance, created_at FROM accounts WHERE id = $1';
      const result = client ? await client.query<Account>(sql, [id]) : await db.query<Account>(sql, [id]);
      return result.rows[0];
    },
    async lock(id: string, client: PoolClient): Promise<Account | undefined> {
      const result = await client.query<Account>('SELECT id, name, balance, created_at FROM accounts WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0];
    },
    async changeBalance(id: string, amount: string, type: TransactionType, client: PoolClient): Promise<string> {
      const operator = type === 'credit' ? '+' : '-'; // Only the domain enum controls SQL syntax.
      const result = await client.query<{ balance: string }>(
        `UPDATE accounts SET balance = balance ${operator} $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance`, [amount, id]);
      return result.rows[0]!.balance;
    },
  };
}
export type AccountRepository = ReturnType<typeof createAccountRepository>;
