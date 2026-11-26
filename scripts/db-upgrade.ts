/**
 * Brings the database up to date after the site changes in code (new pages, sections or fields in content.json).
 * Safe to run more than once, and never overwrites anything a person changed in the admin page:
 *   - a section nobody has edited in the admin page (no "updated by") is replaced with content/content.json;
 *   - a section someone edited keeps their edits; only fields it lacks are filled in from content.json;
 *   - a missing section is added from content.json;
 *   - a section the site no longer has (e.g. the old "about" page) is removed.
 * Before changing anything it saves the current live site as a history copy, and afterwards the new one,
 * so every step can be undone from the admin page's History.
 *
 *   npm run db:upgrade               # dev database (DATABASE_URL)
 *   npm run db:upgrade -- --dry-run  # only show what would change
 *
 * See docs/BACKEND-PLAN.md before running it on production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { inArray, sql } from 'drizzle-orm';
import { contentSchema, contentSections, sectionKeys, type SectionKey } from '../content/content.schema';
import { db, schema } from '../server/db/client';
import { fillMissing } from '../server/fill-missing';

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(import.meta.dirname, '..');
// The database stores JSON with its keys in its own order, so compare with keys sorted.
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
        )
      : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8'));
  const content = contentSchema.parse(raw); // never upgrade from broken content
  const d = db();
  const rows = await d.select().from(schema.sections);
  const byKey = new Map(rows.map((r) => [r.key, r]));

  type Change = { key: SectionKey; draft?: unknown; published?: unknown; insert?: boolean; why: string };
  const changes: Change[] = [];
  const removed = rows.map((r) => r.key).filter((k) => !(sectionKeys as string[]).includes(k));

  for (const key of sectionKeys) {
    const check = contentSections.shape[key];
    const fresh = content[key];
    const row = byKey.get(key);
    if (!row) {
      changes.push({ key, draft: fresh, published: fresh, insert: true, why: 'added from content.json' });
      continue;
    }
    if (row.updatedBy === null) {
      // Never edited by a person: content.json is the newer copy.
      if (!same(row.draft, fresh) || !same(row.published, fresh))
        changes.push({
          key,
          draft: fresh,
          published: fresh,
          why: 'replaced with content.json (not edited in admin)',
        });
      continue;
    }
    // Edited in the admin page: keep the edits, fill only what is missing.
    const upgrade = (stored: unknown, which: string) => {
      if (check.safeParse(stored).success) return undefined;
      const filled = check.safeParse(fillMissing(stored, fresh));
      if (!filled.success)
        throw new Error(
          `${key} (${which}) was edited in the admin page and no longer fits the site; fix it by hand:\n${filled.error}`,
        );
      return filled.data;
    };
    const draft = upgrade(row.draft, 'draft');
    const published = upgrade(row.published, 'live');
    if (draft !== undefined || published !== undefined)
      changes.push({ key, draft, published, why: 'kept admin edits, filled in new fields' });
  }

  for (const k of removed) console.log(`${k}: no longer part of the site, will be removed.`);
  for (const c of changes) console.log(`${c.key}: ${c.why}.`);
  if (!changes.length && !removed.length) {
    console.log('Database already up to date.');
    return;
  }

  // The live site after the change must pass every check (e.g. a supply-chain city must be a real destination).
  const live = Object.fromEntries(
    sectionKeys.map((k) => {
      const c = changes.find((x) => x.key === k);
      return [k, c?.published !== undefined ? c.published : byKey.get(k)!.published];
    }),
  );
  const result = contentSchema.safeParse(live);
  if (!result.success) {
    console.error(`The live site would not pass the checks; nothing was changed:\n${result.error}`);
    process.exit(1);
  }
  if (dryRun) {
    console.log('Dry run: nothing was changed.');
    return;
  }

  const before = Object.fromEntries(rows.map((r) => [r.key, r.published]));
  await d.insert(schema.versions).values({ snapshot: before, note: 'Before site upgrade (automatic copy)' });
  for (const c of changes) {
    if (c.insert) {
      await d.insert(schema.sections).values({ key: c.key, draft: c.draft, published: c.published });
      continue;
    }
    await d
      .update(schema.sections)
      .set({
        ...(c.draft !== undefined && { draft: c.draft }),
        ...(c.published !== undefined && { published: c.published }),
        version: sql`${schema.sections.version} + 1`, // anyone editing this section reloads first
        updatedAt: new Date(),
      })
      .where(sql`${schema.sections.key} = ${c.key}`);
  }
  if (removed.length) await d.delete(schema.sections).where(inArray(schema.sections.key, removed));
  await d.insert(schema.versions).values({ snapshot: result.data, note: 'Site upgrade from content.json' });
  console.log('Done. Live content passes all checks.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
