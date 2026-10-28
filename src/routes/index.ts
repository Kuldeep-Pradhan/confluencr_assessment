import { Router, type Router as RouterType } from 'express';
export function createApiRouter(accounts: RouterType, transactions: RouterType, transfers: RouterType) {
  const router = Router();
  router.use('/accounts', accounts);
  router.use('/accounts/:accountId/transactions', transactions);
  router.use('/transfers', transfers);
  return router;
}
