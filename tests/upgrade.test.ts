/**
 * npm run db:upgrade (server/upgrade.ts): the step that brings the database in line with a new frontend.
 * The rule that matters most: it never overwrites what staff changed in the admin page.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import content from '../content/content.json';
import type { Content } from '../content/content.schema';
import { db, schema } from '../server/db/client';
import { BEFORE_UPGRADE_NOTE, UPGRADE_NOTE, UpgradeError, upgradeDatabase } from '../server/upgrade';
import { PASSWORDS, call, loginAs, resetDatabase } from './helpers';

const site = content as unknown as Content;
const withSummary = (summary: string): Content => ({ ...site, home: { ...site.home, summary } });
const row = async (key: string) =>
  (await db().select().from(schema.sections).where(eq(schema.sections.key, key)))[0];
const versionCount = async () => (await db().select().from(schema.versions)).length;

beforeEach(async () => {
  await resetDatabase();
});

describe('db:upgrade', () => {
  it('does nothing (and writes no history) when the database already matches', async () => {
    const before = await versionCount();
    const report = await upgradeDatabase(site);
    expect(report.changes).toEqual([]);
    expect(report.applied).toBe(false);
    expect(await versionCount()).toBe(before);
  });

  it('is a no-op the second time (key order in the database does not count as a change)', async () => {
    await upgradeDatabase(withSummary('New text from the frontend'));
    const before = await versionCount();
    const again = await upgradeDatabase(withSummary('New text from the frontend'));
    expect(again.changes).toEqual([]);
    expect(await versionCount()).toBe(before);
  });

  it('replaces a section nobody edited, and keeps copies before and after', async () => {
    const report = await upgradeDatabase(withSummary('New text from the frontend'));
    expect(report.changes).toEqual([{ key: 'home', why: 'replaced' }]);
    expect(((await row('home')).published as Content['home']).summary).toBe('New text from the frontend');
    const notes = (await db().select().from(schema.versions)).map((v) => v.note);
    expect(notes.slice(-2)).toEqual([BEFORE_UPGRADE_NOTE, UPGRADE_NOTE]);
  });

  it('never overwrites a section someone edited in the admin page', async () => {
    const admin = await loginAs('admin@test.local', PASSWORDS.admin);
    const home = (await call('GET', '/api/admin/sections/home', { cookie: admin })).data;
    await call('PUT', '/api/admin/sections/home', {
      cookie: admin,
      body: { data: { ...home.draft, summary: 'Typed by staff' }, version: home.version },
    });
    await call('POST', '/api/admin/publish', { cookie: admin, body: {} });
    const report = await upgradeDatabase(withSummary('New text from the frontend'));
    expect(report.changes).toEqual([]);
    expect(((await row('home')).published as Content['home']).summary).toBe('Typed by staff');
  });

  it('adds a new section and removes one the site no longer has', async () => {
    const marico = await row('marico');
    await db().delete(schema.sections).where(eq(schema.sections.key, 'marico'));
    await db().insert(schema.sections).values({ key: 'about', draft: {}, published: {} });
    const report = await upgradeDatabase(site);
    expect(report.removed).toEqual(['about']);
    expect(report.changes).toEqual([{ key: 'marico', why: 'added' }]);
    expect(await row('about')).toBeUndefined();
    expect((await row('marico')).published).toEqual(marico.published);
  });

  it('dry run changes nothing', async () => {
    const before = await versionCount();
    const report = await upgradeDatabase(withSummary('Only a preview'), { dryRun: true });
    expect(report.changes).toEqual([{ key: 'home', why: 'replaced' }]);
    expect(report.applied).toBe(false);
    expect(((await row('home')).published as Content['home']).summary).toBe(site.home.summary);
    expect(await versionCount()).toBe(before);
  });

  it('stops, changing nothing, when an edited section can no longer fit the site', async () => {
    const [user] = await db().select().from(schema.users).limit(1);
    await db()
      .update(schema.sections)
      .set({ draft: { title: 42 }, updatedBy: user.id })
      .where(eq(schema.sections.key, 'home'));
    const before = await versionCount();
    await expect(upgradeDatabase(withSummary('x'))).rejects.toBeInstanceOf(UpgradeError);
    expect(await versionCount()).toBe(before);
  });

  it('refuses broken content.json', async () => {
    await expect(upgradeDatabase({ ...site, units: [] } as Content)).rejects.toThrow();
  });
});
