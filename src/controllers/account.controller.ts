import type { RequestHandler } from 'express';
import type { AccountService } from '../services/account.service.js';
import { sendSuccess } from '../utils/response.js';
export function createAccountController(service: AccountService) {
  const create: RequestHandler = async (_req, res) => {
    const account = await service.create(res.locals.input.body.name as string);
    sendSuccess(res, account, 201);
  };
  const balance: RequestHandler = async (_req, res) => {
    sendSuccess(res, await service.balance(res.locals.input.params.accountId as string));
  };
  return { create, balance };
}
