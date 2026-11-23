/**
 * Loads content/content.json into the database and creates the first admin.
 * Safe to run more than once: existing sections and users are left alone.
 *
 *   npm run db:seed              # fill empty tables
 *   npm run db:seed -- --force   # overwrite every section with content.json (asks no questions; use with care)
 *
 * Uses DATABASE_URL from .env (the dev database). See docs/BACKEND-PLAN.md before seeding production.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { contentSchema, sectionKeys } from '../content/content.schema';
import { db, schema } from '../server/db/client';

const force = process.argv.includes('--force');
const root = path.resolve(import.meta.dirname, '..');

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8'));
  const content = contentSchema.parse(raw); // never seed broken content
  const d = db();

  // Sections
  let created = 0;
  let overwritten = 0;
  for (const key of sectionKeys) {
    const value = content[key];
    const inserted = await d
      .insert(schema.sections)
      .values({ key, draft: value, published: value })
      .onConflictDoNothing()
      .returning({ key: schema.sections.key });
    if (inserted.length) created++;
    else if (force) {
      await d
        .update(schema.sections)
        .set({
          draft: value,
          published: value,
          version: sql`${schema.sections.version} + 1`,
          updatedAt: new Date(),
        })
        .where(sql`${schema.sections.key} = ${key}`);
      overwritten++;
    }
  }
  console.log(
    `Sections: ${created} created, ${overwritten} overwritten, ${sectionKeys.length - created - overwritten} left as they were.`,
  );

  // First history entry, so there is always something to roll back to.
  const [{ count }] = await d.select({ count: sql<number>`count(*)::int` }).from(schema.versions);
  if (count === 0) {
    await d.insert(schema.versions).values({ snapshot: content, note: 'Initial content from content.json' });
    console.log('History: first version saved.');
  }

  // First admins: ADMIN_EMAILS is a comma-separated list.
  // ADMIN_INITIAL_PASSWORD sets their starting password; if empty, a random one is generated and printed.
  // Either way they must choose their own password at first login.
  const emails = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) {
    console.log('Admins: ADMIN_EMAILS is empty in .env, so no admin was created.');
    return;
  }
  const fixedPassword = (process.env.ADMIN_INITIAL_PASSWORD ?? '').trim();
  for (const email of emails) {
    const existing = await d
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${email}`);
    if (existing.length) {
      console.log(`Admin: ${email} already exists (left unchanged).`);
      continue;
    }
    const password = fixedPassword || randomBytes(9).toString('base64url');
    await d.insert(schema.users).values({
      email,
      name: email.split('@')[0],
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      mustChangePassword: true,
    });
    console.log(
      `Admin: created ${email} with ${fixedPassword ? 'the starting password from .env' : `temporary password ${password}`} (must be changed at first login).`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
