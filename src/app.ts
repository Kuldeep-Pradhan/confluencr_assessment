import express from 'express';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import * as errors from './errors/app-error.js';
import { createErrorHandler } from './middlewares/error-handler.js';
import { createNotFoundHandler } from './middlewares/not-found.js';
import { asyncRoute, createValidator } from './middlewares/validate.js';
import { createDatabase } from './db/pool.js';
import { createAccountRepository } from './repositories/account.repository.js';
import { createTransactionRepository } from './repositories/transaction.repository.js';
import { createAccountService } from './services/account.service.js';
import { createTransactionService } from './services/transaction.service.js';
import { createAccountController } from './controllers/account.controller.js';
import { createTransactionController } from './controllers/transaction.controller.js';
import { createAccountRouter } from './routes/account.routes.js';
import { createTransactionRouter } from './routes/transaction.routes.js';
import { createApiRouter } from './routes/index.js';
import { createTransferRepository } from './repositories/transfer.repository.js';
import { createTransferService } from './services/transfer.service.js';
import { createTransferController } from './controllers/transfer.controller.js';
import { createTransferRouter } from './routes/transfer.routes.js';
import type { AppOptions, LedgerApp, Runtime } from './types/index.js';
import { sendSuccess } from './utils/response.js';

export function createApp(options: AppOptions = {}): LedgerApp {
  const config = options.config ?? loadEnv();
  // Single composition root: no service, controller, repository, or middleware
  // imports a runtime logger or error class. Dependencies are shared explicitly.
  const runtime: Runtime = { logger: options.logger ?? createLogger(config.LOG_LEVEL), errors };
  const db = createDatabase(config, runtime, options.pool);
  const app = Object.assign(express(), { locals: { runtime, db, config } });
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    const suppliedId = req.get('X-Request-Id');
    const requestId = suppliedId && /^[a-zA-Z0-9_-]{1,100}$/.test(suppliedId) ? suppliedId : randomUUID();
    res.locals.requestId = requestId;
    res.locals.logger = runtime.logger.child({ request_id: requestId });
    res.setHeader('X-Request-Id', requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => res.locals.logger.info({ method: req.method, path: req.path, status: res.statusCode,
      duration_ms: Number(process.hrtime.bigint() - start) / 1e6 }, 'HTTP request completed'));
    next();
  });
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'script-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null,
  } } }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map(origin => origin.trim()),
    methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-Request-Id'], exposedHeaders: ['X-Request-Id'] }));
  app.use('/api/v1', rateLimit({ windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new errors.RateLimitError()),
  }));
  app.use((req, _res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) { next(new errors.UnsupportedMediaTypeError()); return; }
    next();
  });
  app.use(express.json({ limit: '10kb', strict: true }));
  app.get('/health', (_req, res) => {
    sendSuccess(res, {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
    });
  });

  app.get('/health/ready', asyncRoute(async (_req, res) => {
    try { await db.query('SELECT 1'); } catch (error) { throw new errors.ServiceUnavailableError(error); }
    sendSuccess(res, { status: 'UP', database: 'UP' });
  }));
  app.get('/api/v1', (_req, res) => {
    sendSuccess(res, {
      message: 'Transaction Ledger API v1 ready',
      documentation: '/api/v1/docs',
    });
  });

  const docsUrl = new URL('./docs/openapi.yaml', import.meta.url);
  const sourceDocsUrl = new URL('../docs/openapi.yaml', import.meta.url);
  const document = parse(readFileSync(import.meta.url.includes('/dist/') ? docsUrl : sourceDocsUrl, 'utf8'));
  app.get('/api/v1/openapi.yaml', (_req, res) => res.type('application/yaml').send(readFileSync(import.meta.url.includes('/dist/') ? docsUrl : sourceDocsUrl, 'utf8')));
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(document, { swaggerOptions: { persistAuthorization: false } }));
  const validate = createValidator(runtime);
  const accounts = createAccountRepository(db);
  const transactions = createTransactionRepository();
  const accountController = createAccountController(createAccountService(accounts, runtime));
  const transactionController = createTransactionController(createTransactionService(db, accounts, transactions, runtime));
  const transferController = createTransferController(createTransferService(db, accounts, transactions, createTransferRepository(), runtime));
  app.use('/api/v1', createApiRouter(createAccountRouter(accountController, validate), createTransactionRouter(transactionController, validate), createTransferRouter(transferController, validate)));
  app.use(createNotFoundHandler(runtime));
  app.use(createErrorHandler(runtime));
  return app;
}
