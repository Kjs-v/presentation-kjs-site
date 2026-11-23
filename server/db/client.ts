/**
 * Database connection. Uses Neon's HTTP driver (fast on serverless, no open connections).
 * DATABASE_URL must point at the pooled connection string.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(url), { schema });
}

let shared: Db | undefined;

/** One connection object per server instance. */
export function db(): Db {
  shared ??= createDb();
  return shared;
}

export { schema };
