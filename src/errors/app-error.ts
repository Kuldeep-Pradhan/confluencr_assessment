export class BaseError extends Error {
  constructor(
    message = 'An internal server error occurred',
    public readonly statusCode = 500,
    public readonly code = 'INTERNAL_SERVER_ERROR',
    public readonly details: unknown[] = [],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}
export class ValidationError extends BaseError {
  constructor(details: unknown[] = [], message = 'Invalid request payload or parameters') {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}
export class NotFoundError extends BaseError {
  constructor(message = 'Account not found', code = 'ACCOUNT_NOT_FOUND') { super(message, 404, code); }
}
export class DuplicateTransactionError extends BaseError {
  constructor() { super('Transaction with this reference_id already exists for this account', 409, 'DUPLICATE_TRANSACTION'); }
}
export class DuplicateTransferError extends BaseError {
  constructor() { super('Transfer with this reference_id already exists', 409, 'DUPLICATE_TRANSFER'); }
}
export class InsufficientFundsError extends BaseError {
  constructor() { super('Account has insufficient balance for this operation', 422, 'INSUFFICIENT_FUNDS'); }
}
export class BalanceLimitError extends BaseError {
  constructor() { super('Resulting balance exceeds the supported database balance limit', 422, 'BALANCE_LIMIT_EXCEEDED'); }
}
export class DbError extends BaseError {
  constructor(cause?: unknown) { super('A database operation failed', 500, 'DATABASE_ERROR', [], cause); }
}
export class ServiceUnavailableError extends BaseError {
  constructor(cause?: unknown) { super('Database is unavailable', 503, 'SERVICE_UNAVAILABLE', [], cause); }
}
export class PayloadTooLargeError extends BaseError {
  constructor() { super('Request body exceeds the 10kb limit', 413, 'PAYLOAD_TOO_LARGE'); }
}
export class UnsupportedMediaTypeError extends BaseError {
  constructor() { super('Request body must use application/json', 415, 'UNSUPPORTED_MEDIA_TYPE'); }
}
export class RateLimitError extends BaseError {
  constructor() { super('Too many requests; retry after the rate limit window', 429, 'RATE_LIMIT_EXCEEDED'); }
}
export function fromDatabase(error: unknown): BaseError {
  if (error instanceof BaseError) return error;
  const dbError = error as { code?: string; constraint?: string } | null;
  if (dbError?.code === '23505' && dbError.constraint === 'uq_account_reference') return new DuplicateTransactionError();
  if (dbError?.code === '23505' && dbError.constraint === 'uq_transfer_reference') return new DuplicateTransferError();
  if (dbError?.code === '22003') return new BalanceLimitError();
  return new DbError(error);
}
