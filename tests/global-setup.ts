/**
 * Runs once before the tests: brings the test database up to the latest tables.
 * (Each test file then resets the data it needs with resetDatabase().)
 */
import './env';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { createDb } from '../server/db/client';

export default async function setup() {
  await migrate(createDb(process.env.DATABASE_URL_UNPOOLED), { migrationsFolder: 'server/db/migrations' });
}
