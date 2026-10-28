import pino from 'pino';
import type { Logger } from '../types/index.js';

const scrub = (value: string) => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'transaction-ledger-service' },
    redact: { paths: ['password', 'DATABASE_URL', 'authorization', 'cookie', '*.password', '*.DATABASE_URL'], censor: '[REDACTED]' },
    serializers: {
      err: (error: unknown) => error instanceof Error ? {
        name: error.name, message: scrub(error.message), stack: scrub(error.stack ?? ''),
      } : { message: 'Non-Error rejection' },
    },
  });
}
