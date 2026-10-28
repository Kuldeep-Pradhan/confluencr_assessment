import type { RequestHandler } from 'express';
import type { Runtime } from '../types/index.js';
export function createNotFoundHandler(runtime: Runtime): RequestHandler {
  return (_req, _res, next) => next(new runtime.errors.NotFoundError('Route not found', 'NOT_FOUND'));
}
