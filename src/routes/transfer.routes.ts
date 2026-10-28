import { Router } from 'express';
import type { createTransferController } from '../controllers/transfer.controller.js';
import type { createValidator } from '../middlewares/validate.js';
import { asyncRoute } from '../middlewares/validate.js';
import { transferSchema } from '../schemas/transfer.schema.js';
export function createTransferRouter(controller: ReturnType<typeof createTransferController>, validate: ReturnType<typeof createValidator>) {
  const router = Router();
  router.post('/', validate(transferSchema, 'body'), asyncRoute(controller.create));
  return router;
}
