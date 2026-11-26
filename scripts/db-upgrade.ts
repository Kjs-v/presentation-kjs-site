/**
 * Brings the database up to date after the site structure changes (a new section, or new fields).
 * Safe to run more than once, and never overwrites edits:
 *   - a missing section is added from content/content.json;
 *   - a section that no longer passes the checks gets only its missing fields filled in from content.json.
 * Sections that already pass are left exactly as they are.
 *
 *   npm run db:upgrade
 *
 * Uses DATABASE_URL from .env (the dev database). See docs/BACKEND-PLAN.md before running it on production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { contentSchema, contentSections, sectionKeys } from '../content/content.schema';
import { db, schema } from '../server/db/client';
import { fillMissing } from '../server/fill-missing';

const root = path.resolve(import.meta.dirname, '..');

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8'));
  const content = contentSchema.parse(raw); // never fill from broken content
  const d = db();
  const rows = await d.select().from(schema.sections);
  const byKey = new Map(rows.map((r) => [r.key, r]));

  for (const key of sectionKeys) {
    const check = contentSections.shape[key];
    const row = byKey.get(key);
    if (!row) {
      await d.insert(schema.sections).values({ key, draft: content[key], published: content[key] });
      console.log(`${key}: added from content.json.`);
      continue;
    }
    const upgrade = (stored: unknown, which: string) => {
      if (check.safeParse(stored).success) return null;
      const filled = check.safeParse(fillMissing(stored, content[key]));
      if (!filled.success)
        throw new Error(
          `${key} (${which}) still fails after filling new fields; fix it by hand:\n${filled.error}`,
        );
      return filled.data;
    };
    const draft = upgrade(row.draft, 'draft');
    const published = upgrade(row.published, 'live');
    if (!draft && !published) {
      console.log(`${key}: already up to date.`);
      continue;
    }
    await d
      .update(schema.sections)
      .set({
        ...(draft && { draft }),
        ...(published && { published }),
        version: sql`${schema.sections.version} + 1`, // anyone editing this section reloads first
        updatedAt: new Date(),
      })
      .where(sql`${schema.sections.key} = ${key}`);
    console.log(
      `${key}: new fields filled in (${[draft && 'draft', published && 'live'].filter(Boolean).join(' and ')}).`,
    );
  }

  // Final check across sections (e.g. a supply-chain city must be a real destination).
  const after = await d.select().from(schema.sections);
  const live = Object.fromEntries(after.map((r) => [r.key, r.published]));
  const result = contentSchema.safeParse(live);
  console.log(
    result.success ? 'Live content passes all checks.' : `Live content still has problems:\n${result.error}`,
  );
  if (!result.success) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
