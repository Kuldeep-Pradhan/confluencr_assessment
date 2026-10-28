import { createApp } from '../app.js';
import { runMigrations } from './migration-runner.js';

const app = createApp();
try {
  const applied = await runMigrations(app.locals.db.pool);
  app.locals.runtime.logger.info({ migrations: applied }, 'Database migrations complete');
} catch (error) {
  app.locals.runtime.logger.error({ err: error }, 'Database migration failed');
  process.exitCode = 1;
} finally { await app.locals.db.close(); }
