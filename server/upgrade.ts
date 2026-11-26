/**
 * Brings the database up to date after the site changes in code (new pages, sections or fields).
 * Used by `npm run db:upgrade` (scripts/db-upgrade.ts) and by the tests.
 *
 * Never overwrites what a person changed in the admin page:
 *   - a section nobody has edited in the admin page (no "updated by") is replaced with the new content;
 *   - a section someone edited keeps their edits; only fields it lacks are filled in;
 *   - a missing section is added; a section the site no longer has is removed.
 * All changes are written in one transaction, together with a history copy of the site before and after.
 * A section someone saves while the upgrade runs is left alone (reported in `skipped`; run it again).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  contentSchema,
  contentSections,
  sectionKeys,
  type Content,
  type SectionKey,
} from '../content/content.schema.js';
import { db, schema } from './db/client.js';
import { fillMissing } from './fill-missing.js';

export const UPGRADE_NOTE = 'Site upgrade from content.json';
export const BEFORE_UPGRADE_NOTE = 'Before site upgrade (automatic copy)';

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
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export type UpgradeChange = {
  key: SectionKey;
  why: 'added' | 'replaced' | 'filled';
  draft?: unknown;
  published?: unknown;
};
export type UpgradeReport = {
  removed: string[];
  changes: { key: SectionKey; why: UpgradeChange['why'] }[];
  applied: boolean;
  skipped: SectionKey[];
};

export class UpgradeError extends Error {}

export async function upgradeDatabase(
  content: Content,
  options: { dryRun?: boolean } = {},
): Promise<UpgradeReport> {
  const fresh = contentSchema.parse(content); // never upgrade from broken content
  const d = db();
  const rows = await d.select().from(schema.sections);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const removed = rows.map((r) => r.key).filter((k) => !(sectionKeys as string[]).includes(k));
  const changes: UpgradeChange[] = [];

  for (const key of sectionKeys) {
    const check = contentSections.shape[key];
    const row = byKey.get(key);
    if (!row) {
      changes.push({ key, why: 'added', draft: fresh[key], published: fresh[key] });
      continue;
    }
    if (row.updatedBy === null) {
      if (!sameJson(row.draft, fresh[key]) || !sameJson(row.published, fresh[key]))
        changes.push({ key, why: 'replaced', draft: fresh[key], published: fresh[key] });
      continue;
    }
    const upgrade = (stored: unknown, which: string) => {
      if (check.safeParse(stored).success) return undefined;
      const filled = check.safeParse(fillMissing(stored, fresh[key]));
      if (!filled.success)
        throw new UpgradeError(
          `${key} (${which}) was edited in the admin page and no longer fits the site; fix it by hand:\n${filled.error}`,
        );
      return filled.data;
    };
    const draft = upgrade(row.draft, 'draft');
    const published = upgrade(row.published, 'live');
    if (draft !== undefined || published !== undefined)
      changes.push({ key, why: 'filled', draft, published });
  }

  const report: UpgradeReport = {
    removed,
    changes: changes.map(({ key, why }) => ({ key, why })),
    applied: false,
    skipped: [],
  };
  if (!changes.length && !removed.length) return report;

  // The live site after the change must pass every check (e.g. a supply-chain city must be a real destination).
  const live = Object.fromEntries(
    sectionKeys.map((k) => {
      const c = changes.find((x) => x.key === k);
      return [k, c?.published !== undefined ? c.published : byKey.get(k)!.published];
    }),
  );
  const result = contentSchema.safeParse(live);
  if (!result.success)
    throw new UpgradeError(`The live site would not pass the checks; nothing was changed:\n${result.error}`);
  if (options.dryRun) return report;

  const writes = changes.map((c) => {
    if (c.why === 'added')
      return d
        .insert(schema.sections)
        .values({ key: c.key, draft: c.draft, published: c.published })
        .onConflictDoNothing()
        .returning({ key: schema.sections.key });
    return (
      d
        .update(schema.sections)
        .set({
          ...(c.draft !== undefined && { draft: c.draft }),
          ...(c.published !== undefined && { published: c.published }),
          version: sql`${schema.sections.version} + 1`, // anyone editing this section reloads first
          updatedAt: new Date(),
        })
        // Only if nobody saved it since we read it.
        .where(and(eq(schema.sections.key, c.key), eq(schema.sections.version, byKey.get(c.key)!.version)))
        .returning({ key: schema.sections.key })
    );
  });
  const before = Object.fromEntries(rows.map((r) => [r.key, r.published]));
  const [, ...results] = await d.batch([
    d.insert(schema.versions).values({ snapshot: before, note: BEFORE_UPGRADE_NOTE }),
    ...writes,
    ...(removed.length ? [d.delete(schema.sections).where(inArray(schema.sections.key, removed))] : []),
    d.insert(schema.versions).values({ snapshot: result.data, note: UPGRADE_NOTE }),
  ] as unknown as Parameters<typeof d.batch>[0]);
  report.skipped = changes.filter((_, i) => !(results[i] as unknown[]).length).map((c) => c.key);
  report.applied = true;
  return report;
}
