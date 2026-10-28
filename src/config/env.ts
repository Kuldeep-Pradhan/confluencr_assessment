import dotenv from 'dotenv';
import { z } from 'zod';

const integer = (fallback: string, max = 2147483647) => z.string().regex(/^\d+$/)
  .default(fallback).transform(Number).pipe(z.number().int().min(1).max(max));
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: integer('3000', 65535),
  DATABASE_URL: z.string().url().refine(value => /^postgres(?:ql)?:\/\//.test(value), 'Expected a PostgreSQL URL'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000').refine(value =>
    value.split(',').every(origin => { try { const url = new URL(origin.trim()); return ['http:', 'https:'].includes(url.protocol) && url.origin === origin.trim(); } catch { return false; } }),
    'Provide comma-separated HTTP(S) origins without paths or wildcards'),
  DB_POOL_MAX: integer('20', 100),
  DB_IDLE_TIMEOUT_MS: integer('30000'),
  DB_CONNECTION_TIMEOUT_MS: integer('5000'),
  DB_STATEMENT_TIMEOUT_MS: integer('10000'),
  RATE_LIMIT_WINDOW_MS: integer('60000'),
  RATE_LIMIT_MAX: integer('100'),
});
export type Env = z.infer<typeof envSchema>;
export function loadEnv(): Env {
  dotenv.config({ quiet: true } as Parameters<typeof dotenv.config>[0]);
  // Do not include invalid values (especially DATABASE_URL) in startup errors.
  const result = envSchema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid environment configuration: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  return result.data;
}
