import { Router } from 'express';
import type { createAccountController } from '../controllers/account.controller.js';
import type { createValidator } from '../middlewares/validate.js';
import { asyncRoute } from '../middlewares/validate.js';
import { accountParamsSchema, accountSchema } from '../schemas/account.schema.js';
export function createAccountRouter(controller: ReturnType<typeof createAccountController>, validate: ReturnType<typeof createValidator>) {
  const router = Router();
  router.post('/', validate(accountSchema, 'body'), asyncRoute(controller.create));
  router.get('/:accountId/balance', validate(accountParamsSchema, 'params'), asyncRoute(controller.balance));
  return router;
}
