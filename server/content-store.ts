/**
 * Reading and changing site content in the database.
 * Drafts are checked section by section when saved; publishing checks the whole site at once.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { contentSchema, contentSections, sectionKeys, type SectionKey } from '../content/content.schema.js';
import { db, schema } from './db/client.js';
import { HttpError, validationError } from './http.js';

export const isSectionKey = (key: string): key is SectionKey => (sectionKeys as string[]).includes(key);

async function allSections() {
  const rows = await db().select().from(schema.sections);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const missing = sectionKeys.filter((k) => !byKey.has(k));
  if (missing.length) throw new HttpError(500, `Content is missing sections: ${missing.join(', ')}.`);
  return byKey;
}

/** The live content, in the same shape as content.json. */
export async function publishedContent() {
  const byKey = await allSections();
  return Object.fromEntries(sectionKeys.map((k) => [k, byKey.get(k)!.published]));
}

export async function sectionList() {
  const rows = await db()
    .select({
      key: schema.sections.key,
      version: schema.sections.version,
      updatedAt: schema.sections.updatedAt,
      updatedBy: schema.users.email,
      changed: sql<boolean>`${schema.sections.draft} <> ${schema.sections.published}`,
    })
    .from(schema.sections)
    .leftJoin(schema.users, eq(schema.users.id, schema.sections.updatedBy));
  const order = new Map(sectionKeys.map((k, i) => [k, i]));
  return rows.sort((a, b) => (order.get(a.key as SectionKey) ?? 99) - (order.get(b.key as SectionKey) ?? 99));
}

export async function getSection(key: SectionKey) {
  const [row] = await db().select().from(schema.sections).where(eq(schema.sections.key, key));
  if (!row) throw new HttpError(404, 'Section not found.');
  return {
    key: row.key,
    draft: row.draft,
    published: row.published,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

/**
 * Saves a draft. `version` must be the version the editor started from; if someone else saved in between,
 * nothing is written and the caller gets 409 with who changed it.
 */
export async function saveDraft(key: SectionKey, data: unknown, version: unknown, userId: number) {
  if (!Number.isInteger(version)) throw new HttpError(400, 'Missing the version you started editing from.');
  const parsed = contentSections.shape[key].safeParse(data);
  if (!parsed.success) throw validationError(parsed.error, [key]);

  const [updated] = await db()
    .update(schema.sections)
    .set({
      draft: parsed.data,
      version: sql`${schema.sections.version} + 1`,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(and(eq(schema.sections.key, key), eq(schema.sections.version, version as number)))
    .returning({ version: schema.sections.version, updatedAt: schema.sections.updatedAt });

  if (!updated) {
    const [current] = await db()
      .select({
        version: schema.sections.version,
        updatedAt: schema.sections.updatedAt,
        by: schema.users.email,
      })
      .from(schema.sections)
      .leftJoin(schema.users, eq(schema.users.id, schema.sections.updatedBy))
      .where(eq(schema.sections.key, key));
    if (!current) throw new HttpError(404, 'Section not found.');
    throw new HttpError(
      409,
      `${current.by ?? 'Someone'} changed this section after you opened it. Reload to see their changes.`,
      {
        currentVersion: current.version,
        updatedAt: current.updatedAt,
        updatedBy: current.by,
      },
    );
  }
  return { key, version: updated.version, updatedAt: updated.updatedAt };
}

/** Throws away unpublished edits in one section (draft goes back to the live copy). */
export async function discardDraft(key: SectionKey, userId: number) {
  const [updated] = await db()
    .update(schema.sections)
    .set({
      draft: sql`${schema.sections.published}`,
      version: sql`${schema.sections.version} + 1`,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(schema.sections.key, key))
    .returning({ version: schema.sections.version });
  if (!updated) throw new HttpError(404, 'Section not found.');
  return { key, version: updated.version };
}

/** Checks all drafts together, saves a history copy, and makes them live, all in one go. */
export async function publish(userId: number, note: string) {
  const byKey = await allSections();
  const drafts = Object.fromEntries(sectionKeys.map((k) => [k, byKey.get(k)!.draft]));
  const parsed = contentSchema.safeParse(drafts);
  if (!parsed.success) throw validationError(parsed.error);

  const d = db();
  const [inserted] = await d.batch([
    d
      .insert(schema.versions)
      .values({ snapshot: parsed.data, note: note.slice(0, 200), publishedBy: userId })
      .returning({ id: schema.versions.id, publishedAt: schema.versions.publishedAt }),
    d.update(schema.sections).set({ published: sql`${schema.sections.draft}` }),
  ]);
  return inserted[0];
}

export async function versionList(limit = 50) {
  return db()
    .select({
      id: schema.versions.id,
      note: schema.versions.note,
      publishedAt: schema.versions.publishedAt,
      publishedBy: schema.users.email,
    })
    .from(schema.versions)
    .leftJoin(schema.users, eq(schema.users.id, schema.versions.publishedBy))
    .orderBy(desc(schema.versions.id))
    .limit(limit);
}

/** Puts an earlier published version back live (and in the drafts), and records that as a new version. */
export async function restore(versionId: number, userId: number) {
  const d = db();
  const [old] = await d.select().from(schema.versions).where(eq(schema.versions.id, versionId));
  if (!old) throw new HttpError(404, 'That version does not exist.');
  const parsed = contentSchema.safeParse(old.snapshot);
  if (!parsed.success)
    throw new HttpError(
      409,
      'That version no longer matches the current site structure, so it cannot be restored.',
    );

  const updates = sectionKeys.map((k) =>
    d
      .update(schema.sections)
      .set({
        draft: parsed.data[k],
        published: parsed.data[k],
        version: sql`${schema.sections.version} + 1`,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.sections.key, k)),
  );
  const [inserted] = await d.batch([
    d
      .insert(schema.versions)
      .values({ snapshot: parsed.data, note: `Restored version ${versionId}`, publishedBy: userId })
      .returning({ id: schema.versions.id }),
    ...updates,
  ]);
  return { restored: versionId, newVersion: inserted[0].id };
}

/** Where a file link is still used (drafts, live content and pitches). Empty means it is safe to delete. */
export async function mediaUsage(url: string): Promise<string[]> {
  const needle = `%${url.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const sectionsUsing = await db()
    .select({ key: schema.sections.key })
    .from(schema.sections)
    .where(
      sql`${schema.sections.draft}::text like ${needle} or ${schema.sections.published}::text like ${needle}`,
    );
  const pitchesUsing = await db()
    .select({ slug: schema.pitches.slug })
    .from(schema.pitches)
    .where(
      sql`${schema.pitches.draft}::text like ${needle} or ${schema.pitches.published}::text like ${needle}`,
    );
  return [...sectionsUsing.map((r) => r.key), ...pitchesUsing.map((r) => `pitch:${r.slug}`)];
}
