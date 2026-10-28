import type { Application } from 'express';
import type { Pool } from 'pg';
import type { Env } from '../config/env.js';
import type { Database } from '../db/pool.js';

// Type-only references are erased: app.ts is the ONLY runtime importer.
export type ErrorTypes = typeof import('../errors/app-error.js');
export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
  fatal(fields: Record<string, unknown>, message: string): void;
  child(fields: Record<string, unknown>): Logger;
}
export interface Runtime { logger: Logger; errors: ErrorTypes; }
export interface AppOptions { config?: Env; pool?: Pool; logger?: Logger; }
export type LedgerApp = Application & { locals: { runtime: Runtime; db: Database; config: Env } };
export interface Account { id: string; name: string; balance: string; created_at: Date; }
export type TransactionType = 'credit' | 'debit';
export interface LedgerTransaction {
  id: string; account_id: string; type: TransactionType; amount: string;
  description: string; reference_id: string; created_at: Date;
}
export interface TransactionInput { type: TransactionType; amount: string; description: string; reference_id: string; }
export interface HistoryInput { type?: TransactionType | undefined; page: number; limit: number; }
