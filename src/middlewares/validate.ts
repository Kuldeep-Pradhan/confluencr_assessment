import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import type { Runtime } from '../types/index.js';
export function createValidator(runtime: Runtime) {
  return (schema: ZodType, target: 'body' | 'params' | 'query'): RequestHandler => (req, res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(new runtime.errors.ValidationError(result.error.issues.map(issue => ({ path: [target, ...issue.path].join('.'), message: issue.message }))));
      return;
    }
    res.locals.input ??= {};
    res.locals.input[target] = result.data;
    next();
  };
}
export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
}
