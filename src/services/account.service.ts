import type { AccountRepository } from '../repositories/account.repository.js';
import type { Runtime } from '../types/index.js';
export function createAccountService(accounts: AccountRepository, runtime: Runtime) {
  return {
    create: (name: string) => accounts.create(name),
    async balance(accountId: string) {
      const account = await accounts.find(accountId);
      if (!account) throw new runtime.errors.NotFoundError();
      return { account_id: account.id, name: account.name, balance: account.balance };
    },
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
