/**
 * Database tables (Drizzle). Change a table here, then run `npm run db:generate` and `npm run db:migrate`.
 * See docs/BACKEND-PLAN.md for why each table exists.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Staff logins. Passwords are bcrypt hashes; session_version goes up to log a user out everywhere. */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'editor'] })
      .notNull()
      .default('editor'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    sessionVersion: integer('session_version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`)],
);

/** One row per content section (site, home, about, products, …): a draft being edited and the live copy. */
export const sections = pgTable('sections', {
  key: text('key').primaryKey(),
  draft: jsonb('draft').notNull(),
  published: jsonb('published').notNull(),
  /** Goes up on every save; a save must send the version it started from (protects against two people editing). */
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

/** A full copy of the published content at every publish, used for history and rollback. */
export const versions = pgTable('versions', {
  id: serial('id').primaryKey(),
  snapshot: jsonb('snapshot').notNull(),
  note: text('note').notNull().default(''),
  publishedBy: integer('published_by').references(() => users.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Uploaded files (Vercel Blob). */
export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  pathname: text('pathname').notNull(),
  contentType: text('content_type').notNull().default(''),
  size: integer('size').notNull().default(0),
  alt: text('alt').notNull().default(''),
  uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** Client presentations (e.g. "mayora"), with a draft and a live copy like sections. */
export const pitches = pgTable('pitches', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  draft: jsonb('draft').notNull(),
  published: jsonb('published').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

/** Login attempts, used to slow down password guessing. */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    ip: text('ip').notNull().default(''),
    success: boolean('success').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('login_attempts_email_time').on(t.email, t.createdAt)],
);

/** Meeting notes taken during presentations (staff only). */
export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  /** Made by the browser when a note is started, so saving the same note twice never makes a duplicate. */
  clientId: text('client_id').unique(),
  visitor: text('visitor').notNull().default(''),
  company: text('company').notNull().default(''),
  body: text('body').notNull().default(''),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
