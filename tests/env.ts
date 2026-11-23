/**
 * Points every test at the test database (kjs_test), never at dev or production.
 */
import fs from 'node:fs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL is not set in .env (see .env.example).');
if (!/\/kjs_test\?/.test(process.env.TEST_DATABASE_URL))
  throw new Error('TEST_DATABASE_URL must point at the kjs_test database.');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL_UNPOOLED ?? process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
delete process.env.BLOB_READ_WRITE_TOKEN; // uploads are tested without touching real storage
