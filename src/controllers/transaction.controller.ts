import type { RequestHandler } from 'express';
import type { TransactionService } from '../services/transaction.service.js';
import type { HistoryInput, TransactionInput } from '../types/index.js';
import { sendSuccess } from '../utils/response.js';
export function createTransactionController(service: TransactionService) {
  const create: RequestHandler = async (_req, res) => {
    sendSuccess(res, await service.create(res.locals.input.params.accountId as string, res.locals.input.body as TransactionInput), 201);
  };
  const history: RequestHandler = async (_req, res) => {
    sendSuccess(res, await service.history(res.locals.input.params.accountId as string, res.locals.input.query as HistoryInput));
  };
  return { create, history };
}
