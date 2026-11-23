import { defineConfig } from 'drizzle-kit';

// Migrations need the direct (unpooled) connection.
// Locally this is the dev database from .env; for go-live, run with the production values (see docs/BACKEND-PLAN.md).
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '' },
  strict: true,
});
