/**
 * Edge cases from the code review (2026-11-27): odd input, abuse, and states the happy-path tests don't reach.
 * Runs against the kjs_test database, like tests/api.test.ts.
 */
import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import content from '../content/content.json';
import { db, schema } from '../server/db/client';
import { eq } from 'drizzle-orm';
import { PASSWORDS, call, loginAs, resetDatabase } from './helpers';

let admin = '';

beforeAll(async () => {
  await resetDatabase();
  admin = await loginAs('admin@test.local', PASSWORDS.admin);
});

describe('requests the router must survive', () => {
  it('answers 404, not 500, for a broken %-escape in the address', async () => {
    const res = await call('GET', '/api/admin/sections/%E0%A4%A', { cookie: admin });
    expect(res.status).toBe(404);
  });

  it('answers 404 for a section the site no longer has', async () => {
    expect((await call('GET', '/api/admin/sections/about', { cookie: admin })).status).toBe(404);
    expect((await call('GET', '/api/admin/sections/__proto__', { cookie: admin })).status).toBe(404);
  });

  it('refuses a body that is not JSON, or too large', async () => {
    const notJson = await call('POST', '/api/auth/login', { body: undefined });
    expect(notJson.status).toBe(400);
    const huge = await call('POST', '/api/admin/notes', {
      cookie: admin,
      body: { clientId: 'abcdefgh12', body: 'x'.repeat(2_100_000) },
    });
    expect(huge.status).toBe(413);
  });

  it('answers HEAD on the content address', async () => {
    expect((await call('HEAD', '/api/content')).status).toBe(200);
  });
});

describe('login edge cases', () => {
  it('accepts the email in any case and with spaces around it', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: '  ADMIN@Test.Local ', password: PASSWORDS.admin },
    });
    expect(res.status).toBe(200);
  });

  it('treats a login signed with another secret as signed out', async () => {
    const forged = await new SignJWT({ sv: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-different-secret-that-is-32-characters'));
    const res = await call('GET', '/api/admin/sections', { cookie: `kjs_session=${forged}` });
    expect(res.status).toBe(401);
  });

  it('treats an expired login as signed out', async () => {
    const expired = await new SignJWT({ sv: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
    expect((await call('GET', '/api/admin/sections', { cookie: `kjs_session=${expired}` })).status).toBe(401);
  });

  it('does not reveal whether an email exists (same answer for unknown and wrong password)', async () => {
    const unknown = await call('POST', '/api/auth/login', {
      body: { email: 'nobody@test.local', password: 'whatever-123' },
    });
    const wrong = await call('POST', '/api/auth/login', {
      body: { email: 'editor@test.local', password: 'whatever-123' },
    });
    expect(unknown.status).toBe(401);
    expect(wrong.data).toEqual(unknown.data);
  });

  it('a turned-off login stays signed out after being turned on again (old cookie is dead)', async () => {
    const editor = await loginAs('editor@test.local', PASSWORDS.editor);
    const [ed] = await db().select().from(schema.users).where(eq(schema.users.email, 'editor@test.local'));
    expect(
      (await call('PUT', `/api/admin/users/${ed.id}`, { cookie: admin, body: { active: false } })).status,
    ).toBe(200);
    expect(
      (await call('PUT', `/api/admin/users/${ed.id}`, { cookie: admin, body: { active: true } })).status,
    ).toBe(200);
    expect((await call('GET', '/api/admin/sections', { cookie: editor })).status).toBe(401);
  });

  it('an admin cannot reset their own password with the reset button (it would lock them out)', async () => {
    const [me] = await db().select().from(schema.users).where(eq(schema.users.email, 'admin@test.local'));
    const res = await call('POST', `/api/admin/users/${me.id}/reset-password`, { cookie: admin });
    expect(res.status).toBe(409);
    expect((await call('GET', '/api/admin/sections', { cookie: admin })).status).toBe(200);
  });
});

describe('content edge cases', () => {
  it('needs the version as a whole number', async () => {
    const home = (await call('GET', '/api/admin/sections/home', { cookie: admin })).data;
    for (const version of [String(home.version), null, 1.5]) {
      const res = await call('PUT', '/api/admin/sections/home', {
        cookie: admin,
        body: { data: home.draft, version },
      });
      expect(res.status).toBe(400);
    }
  });

  it('drops fields the site does not know about instead of storing them', async () => {
    const home = (await call('GET', '/api/admin/sections/home', { cookie: admin })).data;
    const saved = await call('PUT', '/api/admin/sections/home', {
      cookie: admin,
      body: { data: { ...home.draft, sneaky: '<script>' }, version: home.version },
    });
    expect(saved.status).toBe(200);
    const after = (await call('GET', '/api/admin/sections/home', { cookie: admin })).data;
    expect(after.draft).not.toHaveProperty('sneaky');
    await call('POST', '/api/admin/sections/home/discard', { cookie: admin });
  });

  it('refuses to restore a copy that can no longer fit the site, without changing anything', async () => {
    const before = (await call('GET', '/api/content')).data;
    const [row] = await db()
      .insert(schema.versions)
      .values({ snapshot: { ...content, home: { title: 42 } }, note: 'Broken old copy' })
      .returning({ id: schema.versions.id });
    const res = await call('POST', `/api/admin/versions/${row.id}/restore`, { cookie: admin });
    expect(res.status).toBe(409);
    expect((await call('GET', '/api/content')).data).toEqual(before);
  });

  it('the live site always matches the latest history copy after publishing', async () => {
    const home = (await call('GET', '/api/admin/sections/home', { cookie: admin })).data;
    await call('PUT', '/api/admin/sections/home', {
      cookie: admin,
      body: { data: { ...home.draft, summary: 'Edge-case publish' }, version: home.version },
    });
    const pub = await call('POST', '/api/admin/publish', { cookie: admin, body: { note: 'x'.repeat(500) } });
    expect(pub.status).toBe(200);
    const [latest] = await db().select().from(schema.versions).where(eq(schema.versions.id, pub.data.id));
    expect(latest.note.length).toBe(200);
    expect((await call('GET', '/api/content')).data).toEqual(latest.snapshot);
  });

  it('says clearly (500 with a reason) when a section row is missing, and the admin list still opens', async () => {
    const [row] = await db().select().from(schema.sections).where(eq(schema.sections.key, 'marico'));
    await db().delete(schema.sections).where(eq(schema.sections.key, 'marico'));
    try {
      const res = await call('GET', '/api/content');
      expect(res.status).toBe(500);
      expect(res.data.error).toContain('marico');
      expect((await call('GET', '/api/admin/sections', { cookie: admin })).status).toBe(200);
    } finally {
      await db().insert(schema.sections).values(row);
    }
  });
});

describe('meeting notes edge cases', () => {
  it('accepts a note at the length limit and refuses one over it', async () => {
    const at = await call('POST', '/api/admin/notes', {
      cookie: admin,
      body: { clientId: 'limit-note-1', body: 'x'.repeat(20_000) },
    });
    expect(at.status).toBe(201);
    const over = await call('POST', '/api/admin/notes', {
      cookie: admin,
      body: { clientId: 'limit-note-2', body: 'x'.repeat(20_001) },
    });
    expect(over.status).toBe(400);
  });

  it('refuses bad note ids and empty notes', async () => {
    for (const clientId of ['short', 'has spaces in it', '../../etc', 'x'.repeat(65), 123]) {
      const res = await call('POST', '/api/admin/notes', { cookie: admin, body: { clientId, body: 'hi' } });
      expect(res.status).toBe(400);
    }
    const empty = await call('POST', '/api/admin/notes', {
      cookie: admin,
      body: { clientId: 'empty-note-1', visitor: '   ', body: '  \n ' },
    });
    expect(empty.status).toBe(400);
  });

  it('saving the same note twice at once never makes two notes', async () => {
    const body = { clientId: 'twice-at-once-1', body: 'same note' };
    const results = await Promise.all([
      call('POST', '/api/admin/notes', { cookie: admin, body }),
      call('POST', '/api/admin/notes', { cookie: admin, body }),
    ]);
    expect(results.every((r) => [200, 201, 409].includes(r.status))).toBe(true);
    const rows = await db().select().from(schema.notes).where(eq(schema.notes.clientId, 'twice-at-once-1'));
    expect(rows).toHaveLength(1);
  });
});
