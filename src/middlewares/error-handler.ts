import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Runtime } from '../types/index.js';
import { sendError } from '../utils/response.js';

export function createErrorHandler(runtime: Runtime): ErrorRequestHandler {
  return (original: unknown, req, res, next): void => {
    let error = original instanceof runtime.errors.BaseError ? original : new runtime.errors.BaseError(undefined, undefined, undefined, [], original);
    if (original instanceof ZodError) error = new runtime.errors.ValidationError(original.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })));
    const parserError = original as { type?: string } | null;
    if (parserError?.type === 'entity.parse.failed') error = new runtime.errors.ValidationError([], 'Malformed JSON in request body');
    if (parserError?.type === 'entity.too.large') error = new runtime.errors.PayloadTooLargeError();
    if (parserError?.type === 'encoding.unsupported' || parserError?.type === 'charset.unsupported') error = new runtime.errors.UnsupportedMediaTypeError();
    const logger = res.locals.logger ?? runtime.logger;
    if (error.statusCode >= 500) logger.error({ err: original, code: error.code, request_id: res.locals.requestId, method: req.method, path: req.path }, 'Request failed');
    if (res.headersSent) { next(original); return; }
    sendError(res, error.statusCode, error.code, error.message, error.details);
  };
}
