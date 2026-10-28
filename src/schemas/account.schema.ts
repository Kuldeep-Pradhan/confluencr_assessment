import { z } from 'zod';
export const accountSchema = z.object({ name: z.string().trim().min(1).max(255) }).strict();
export const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Expected a UUIDv4').transform(value => value.toLowerCase());
export const accountParamsSchema = z.object({ accountId: uuidSchema }).strict();
