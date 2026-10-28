import type { RequestHandler } from 'express';
import type { TransferService } from '../services/transfer.service.js';
import type { TransferInput } from '../schemas/transfer.schema.js';
import { sendSuccess } from '../utils/response.js';
export function createTransferController(service: TransferService) {
  const create: RequestHandler = async (_req, res) => {
    sendSuccess(res, await service.create(res.locals.input.body as TransferInput), 201);
  };
  return { create };
}
