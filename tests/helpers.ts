import dotenv from 'dotenv';
import { createApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import request from 'supertest';
import assert from 'node:assert/strict';
import type { LedgerApp } from '../src/types/index.js';

export function createIntegrationApp(): LedgerApp {
  dotenv.config();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required; start Docker Desktop and copy .env.example to .env');
  const database = new URL(url);
  if (!decodeURIComponent(database.pathname).endsWith('_test') || database.pathname === new URL(process.env.DATABASE_URL ?? url).pathname) {
    throw new Error('Tests require a separate database ending in _test; refusing to use the application database');
  }
  return createApp({ config: envSchema.parse({ ...process.env, DATABASE_URL: url, NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '100000' }) });
}
export async function createAccount(app: LedgerApp, name = 'Test Account'): Promise<string> {
  const response = await request(app).post('/api/v1/accounts').send({ name }).expect(201);
  return response.body.data.id as string;
}
export async function getBalance(app: LedgerApp, id: string): Promise<string> {
  const response = await request(app).get(`/api/v1/accounts/${id}/balance`).expect(200);
  return response.body.data.balance as string;
}
export function addTransaction(app: LedgerApp, id: string, type: string, amount: string, reference: string = crypto.randomUUID()) {
  return request(app).post(`/api/v1/accounts/${id}/transactions`).send({ type, amount, reference_id: reference });
}
export async function reconcile(app: LedgerApp, id: string): Promise<void> {
  const result = await app.locals.db.pool.query<{ balanced: boolean }>(`SELECT a.balance = COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS balanced
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id WHERE a.id = $1 GROUP BY a.id`, [id]);
  assert.equal(result.rows[0]?.balanced, true);
}
