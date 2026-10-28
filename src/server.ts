import { createApp } from './app.js';

const app = createApp();

const { runtime, db, config } = app.locals;
let stopping = false;
const server = app.listen(config.PORT, () => runtime.logger.info({ port: config.PORT, environment: config.NODE_ENV }, 'Transaction Ledger Service started'));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on('error', error => { runtime.logger.fatal({ err: error }, 'HTTP server failed'); void shutdown('serverError', 1); });

async function shutdown(reason: string, code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  runtime.logger.info({ reason }, 'Shutting down');
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  try {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
    clearTimeout(timeout);
    process.exitCode = code;
  } catch (error) { runtime.logger.fatal({ err: error }, 'Shutdown failed'); process.exit(1); }
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.on('unhandledRejection', error => { runtime.logger.fatal({ err: error }, 'Unhandled rejection'); void shutdown('unhandledRejection', 1); });
process.on('uncaughtException', error => { runtime.logger.fatal({ err: error }, 'Uncaught exception'); void shutdown('uncaughtException', 1); });
