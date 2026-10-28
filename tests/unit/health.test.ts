import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { envSchema } from '../../src/config/env.js';

const app = createApp({ config: envSchema.parse({ DATABASE_URL: 'postgresql://unit:unit@localhost:1/unit_test', NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });
after(() => app.locals.db.close());

test('GET /health returns 200 and healthy status', async () => {
  const res = await request(app).get('/health').expect(200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'UP');
  assert.ok(res.headers['x-request-id']);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('GET /unknown-route returns 404 NOT_FOUND error response', async () => {
  const res = await request(app).get('/api/v1/non-existent').expect(404);
  assert.deepEqual(res.body, { success: false, error: { code: 'NOT_FOUND', message: 'Route not found', details: [] } });
});
test('readiness distinguishes database outage and does not leak credentials', async () => {
  const res = await request(app).get('/health/ready').expect(503);
  assert.equal(res.body.error.code, 'SERVICE_UNAVAILABLE');
  assert.ok(!JSON.stringify(res.body).includes('postgresql'));
});
test('rate limiter uses the centralized error envelope', async () => {
  const limited = createApp({ config: { ...app.locals.config, RATE_LIMIT_MAX: 1 } });
  try {
    await request(limited).get('/api/v1').expect(200);
    const res = await request(limited).get('/api/v1').expect(429);
    assert.equal(res.body.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.deepEqual(res.body.error.details, []);
    assert.ok(res.headers['ratelimit']);
  } finally { await limited.locals.db.close(); }
});
test('CORS allows only configured origins', async () => {
  const allowed = await request(app).get('/health').set('Origin', 'http://localhost:3000').expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:3000');
  const denied = await request(app).get('/health').set('Origin', 'https://untrusted.example').expect(200);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});
