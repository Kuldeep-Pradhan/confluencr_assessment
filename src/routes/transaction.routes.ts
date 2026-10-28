import { Router } from 'express';
import type { createTransactionController } from '../controllers/transaction.controller.js';
import type { createValidator } from '../middlewares/validate.js';
import { asyncRoute } from '../middlewares/validate.js';
import { accountParamsSchema } from '../schemas/account.schema.js';
import { historySchema, transactionSchema } from '../schemas/transaction.schema.js';
export function createTransactionRouter(controller: ReturnType<typeof createTransactionController>, validate: ReturnType<typeof createValidator>) {
  const router = Router({ mergeParams: true });
  router.use(validate(accountParamsSchema, 'params'));
  router.post('/', validate(transactionSchema, 'body'), asyncRoute(controller.create));
  router.get('/', validate(historySchema, 'query'), asyncRoute(controller.history));
  return router;
}
