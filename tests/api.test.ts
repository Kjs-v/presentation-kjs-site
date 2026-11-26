/**
 * API tests, run against the kjs_test database (see tests/env.ts).
 * Each block covers one promise from docs/BACKEND-PLAN.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import content from '../content/content.json';
import { db, schema } from '../server/db/client';
import { PASSWORDS, call, loginAs, resetDatabase } from './helpers';

let admin = '';
let editor = '';

beforeAll(async () => {
  await resetDatabase();
  admin = await loginAs('admin@test.local', PASSWORDS.admin);
  editor = await loginAs('editor@test.local', PASSWORDS.editor);
});

describe('public endpoints', () => {
  it('reports healthy', async () => {
    expect((await call('GET', '/api/health')).data).toEqual({ ok: true });
  });

  it('serves the published content, cacheable by Vercel', async () => {
    const res = await call('GET', '/api/content');
    expect(res.status).toBe(200);
    expect(Object.keys(res.data)).toEqual(Object.keys(content));
    expect(res.data.site.name).toBe(content.site.name);
    expect(res.headers.get('cache-control')).toContain('s-maxage=60');
  });

  it('answers 404 for unknown addresses and 405 for wrong methods', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('DELETE', '/api/content')).status).toBe(405);
  });
});

describe('login', () => {
  it('keeps staff pages closed without a login', async () => {
    expect((await call('GET', '/api/admin/sections')).status).toBe(401);
  });

  it('rejects a wrong password without saying which part was wrong', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: 'admin@test.local', password: 'nope-nope' },
    });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Wrong email or password.');
  });

  it('logs in with an httpOnly cookie and knows who you are', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: 'ADMIN@test.local', password: PASSWORDS.admin },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=Lax/);
    const me = await call('GET', '/api/auth/me', { cookie: res.cookie });
    expect(me.data.user.email).toBe('admin@test.local');
    expect(me.data.user).not.toHaveProperty('passwordHash');
  });

  it('slows down password guessing (429 after 5 wrong tries)', async () => {
    const created = await call('POST', '/api/admin/users', {
      cookie: admin,
      body: { email: 'guess@test.local' },
    });
    for (let i = 0; i < 5; i++)
      await call('POST', '/api/auth/login', { body: { email: 'guess@test.local', password: 'wrong-' + i } });
    const res = await call('POST', '/api/auth/login', {
      body: { email: 'guess@test.local', password: created.data.temporaryPassword },
    });
    expect(res.status).toBe(429);
  });

  it('rejects writes from other websites', async () => {
    const res = await call('POST', '/api/admin/publish', {
      cookie: admin,
      origin: 'https://evil.example',
      body: {},
    });
    expect(res.status).toBe(403);
    const noOrigin = await call('POST', '/api/admin/publish', { cookie: admin, origin: null, body: {} });
    expect(noOrigin.status).toBe(403);
  });
});

describe('first login and password changes', () => {
  it('forces a new password, then ends logins on other devices', async () => {
    const created = await call('POST', '/api/admin/users', {
      cookie: admin,
      body: { email: 'new@test.local', name: 'New', role: 'editor' },
    });
    expect(created.status).toBe(201);
    const temp = created.data.temporaryPassword;
    const first = await loginAs('new@test.local', temp);
    const otherDevice = await loginAs('new@test.local', temp);

    expect((await call('GET', '/api/admin/sections', { cookie: first })).status).toBe(403);

    const weak = await call('POST', '/api/auth/change-password', {
      cookie: first,
      body: { currentPassword: temp, newPassword: 'password' },
    });
    expect(weak.status).toBe(400);

    const ok = await call('POST', '/api/auth/change-password', {
      cookie: first,
      body: { currentPassword: temp, newPassword: 'a-much-better-pass-2026' },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.user.mustChangePassword).toBe(false);
    expect((await call('GET', '/api/admin/sections', { cookie: ok.cookie })).status).toBe(200);
    expect((await call('GET', '/api/auth/me', { cookie: otherDevice })).data.user).toBeNull();
  });
});

describe('editing and publishing', () => {
  it('lists sections and opens one with its version', async () => {
    const list = await call('GET', '/api/admin/sections', { cookie: editor });
    expect(list.data.sections.map((s: { key: string }) => s.key)).toEqual(Object.keys(content));
    const home = await call('GET', '/api/admin/sections/home', { cookie: editor });
    expect(home.data.version).toBe(1);
    expect(home.data.draft.title).toBe(content.home.title);
  });

  it('rejects invalid content and says which field is wrong', async () => {
    const home = (await call('GET', '/api/admin/sections/home', { cookie: editor })).data;
    const res = await call('PUT', '/api/admin/sections/home', {
      cookie: editor,
      body: {
        data: { ...home.draft, clients: [{ name: 'Bad', logo: 'https://evil.example/x.png' }] },
        version: home.version,
      },
    });
    expect(res.status).toBe(400);
    expect(res.data.details[0].path).toBe('home.clients.0.logo');
  });

  it('protects against two people saving the same section', async () => {
    const home = (await call('GET', '/api/admin/sections/home', { cookie: editor })).data;
    const mine = await call('PUT', '/api/admin/sections/home', {
      cookie: editor,
      body: { data: { ...home.draft, summary: 'Edited by the editor' }, version: home.version },
    });
    expect(mine.status).toBe(200);
    const theirs = await call('PUT', '/api/admin/sections/home', {
      cookie: admin,
      body: { data: { ...home.draft, summary: 'Edited by the admin' }, version: home.version },
    });
    expect(theirs.status).toBe(409);
    expect(theirs.data.error).toContain('editor@test.local');
  });

  it('keeps drafts off the live site until published', async () => {
    expect((await call('GET', '/api/content')).data.home.summary).toBe(content.home.summary);
    const published = await call('POST', '/api/admin/publish', {
      cookie: editor,
      body: { note: 'New summary' },
    });
    expect(published.status).toBe(200);
    expect((await call('GET', '/api/content')).data.home.summary).toBe('Edited by the editor');
  });

  it('refuses to publish content that breaks across sections', async () => {
    const products = (await call('GET', '/api/admin/sections/products', { cookie: editor })).data;
    const broken = structuredClone(products.draft);
    broken[0].unit = 'unit-99';
    const saved = await call('PUT', '/api/admin/sections/products', {
      cookie: editor,
      body: { data: broken, version: products.version },
    });
    expect(saved.status).toBe(200); // valid on its own…
    const pub = await call('POST', '/api/admin/publish', { cookie: editor, body: {} });
    expect(pub.status).toBe(400); // …but not with the units that exist
    expect((await call('POST', '/api/admin/sections/products/discard', { cookie: editor })).status).toBe(200);
    expect((await call('GET', '/api/admin/sections/products', { cookie: editor })).data.draft[0].unit).toBe(
      content.products[0].unit,
    );
  });

  it('keeps history and rolls back', async () => {
    const versions = (await call('GET', '/api/admin/versions', { cookie: editor })).data.versions;
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const first = versions[versions.length - 1];
    const res = await call('POST', `/api/admin/versions/${first.id}/restore`, { cookie: editor });
    expect(res.status).toBe(200);
    expect((await call('GET', '/api/content')).data.home.summary).toBe(content.home.summary);
    const after = (await call('GET', '/api/admin/versions', { cookie: editor })).data.versions;
    expect(after[0].note).toBe(`Restored version ${first.id}`);
  });

  it('restores a version saved before a section or field was added', async () => {
    // An old copy: no supplyChain section, and the menu has no colour options yet.
    const { supplyChain: _gone, ...old } = structuredClone(content);
    delete (old.site.menu as Partial<typeof old.site.menu>).colour;
    old.home.summary = 'Summary from an old version';
    const [row] = await db()
      .insert(schema.versions)
      .values({ snapshot: old, note: 'Old shape' })
      .returning({ id: schema.versions.id });
    const res = await call('POST', `/api/admin/versions/${row.id}/restore`, { cookie: editor });
    expect(res.status).toBe(200);
    const live = (await call('GET', '/api/content')).data;
    expect(live.home.summary).toBe('Summary from an old version');
    expect(live.supplyChain).toEqual(content.supplyChain);
    expect(live.site.menu.colour).toEqual(content.site.menu.colour);
  });

  it('describes every section for the admin page', async () => {
    const res = await call('GET', '/api/admin/schema', { cookie: editor });
    expect(res.data.sections).toEqual(Object.keys(content));
    expect(res.data.schema.properties.site.properties.name.description).toBe('Company name');
  });
});

describe('media', () => {
  const url = 'https://abc123.public.blob.vercel-storage.com/products/test-AbC1.webp';

  it('accepts only files from the site storage', async () => {
    const bad = await call('POST', '/api/admin/media', {
      cookie: editor,
      body: { url: 'https://evil.example/x.png' },
    });
    expect(bad.status).toBe(400);
    const good = await call('POST', '/api/admin/media', { cookie: editor, body: { url, alt: 'Test pack' } });
    expect(good.status).toBe(201);
  });

  it('refuses to delete a file that content still uses', async () => {
    const [file] = (await call('GET', '/api/admin/media', { cookie: editor })).data.media;
    const promoters = (await call('GET', '/api/admin/sections/promoters', { cookie: editor })).data;
    const saved = await call('PUT', '/api/admin/sections/promoters', {
      cookie: editor,
      body: {
        data: {
          ...promoters.draft,
          people: [{ ...promoters.draft.people[0], photo: url }, ...promoters.draft.people.slice(1)],
        },
        version: promoters.version,
      },
    });
    expect(saved.status).toBe(200);
    const blocked = await call('DELETE', `/api/admin/media/${file.id}`, { cookie: editor });
    expect(blocked.status).toBe(409);
    expect(blocked.data.details.usedIn).toEqual(['promoters']);
    await call('POST', '/api/admin/sections/promoters/discard', { cookie: editor });
    expect((await call('DELETE', `/api/admin/media/${file.id}`, { cookie: editor })).status).toBe(200);
  });

  it('says clearly when uploads are not set up yet', async () => {
    const res = await call('POST', '/api/admin/media/upload', {
      cookie: editor,
      body: {
        type: 'blob.generate-client-token',
        payload: { pathname: 'x.png', callbackUrl: '', clientPayload: null, multipart: false },
      },
    });
    expect(res.status).toBe(503);
  });
});

describe('users', () => {
  it('has only admins: new logins are admins, and an old non-admin login is refused', async () => {
    const created = await call('POST', '/api/admin/users', {
      cookie: editor,
      body: { email: 'fresh@test.local' },
    });
    expect(created.status).toBe(201);
    expect(created.data.user.role).toBe('admin');
    const legacy = await loginAs('legacy@test.local', PASSWORDS.legacy);
    expect((await call('GET', '/api/admin/sections', { cookie: legacy })).status).toBe(403);
    expect((await call('GET', '/api/admin/users', { cookie: legacy })).status).toBe(403);
  });

  it('never returns password hashes', async () => {
    const res = await call('GET', '/api/admin/users', { cookie: admin });
    expect(JSON.stringify(res.data)).not.toContain('$2');
  });

  it('signs a removed user out immediately', async () => {
    const created = await call('POST', '/api/admin/users', {
      cookie: admin,
      body: { email: 'temp@test.local' },
    });
    const theirs = await loginAs('temp@test.local', created.data.temporaryPassword);
    expect((await call('GET', '/api/auth/me', { cookie: theirs })).data.user).not.toBeNull();
    expect((await call('DELETE', `/api/admin/users/${created.data.user.id}`, { cookie: admin })).status).toBe(
      200,
    );
    expect((await call('GET', '/api/auth/me', { cookie: theirs })).data.user).toBeNull();
    const again = await call('POST', '/api/auth/login', {
      body: { email: 'temp@test.local', password: created.data.temporaryPassword },
    });
    expect(again.status).toBe(401);
  });

  it('resets a password and ends the old logins', async () => {
    const users = (await call('GET', '/api/admin/users', { cookie: admin })).data.users;
    const ed = users.find((u: { email: string }) => u.email === 'editor@test.local');
    const before = await loginAs('editor@test.local', PASSWORDS.editor);
    const reset = await call('POST', `/api/admin/users/${ed.id}/reset-password`, { cookie: admin });
    expect(reset.data.user.mustChangePassword).toBe(true);
    expect((await call('GET', '/api/auth/me', { cookie: before })).data.user).toBeNull();
    expect(
      (
        await call('POST', '/api/auth/login', {
          body: { email: 'editor@test.local', password: PASSWORDS.editor },
        })
      ).status,
    ).toBe(401);
  });

  it('never leaves the site without an admin, and admins cannot remove themselves', async () => {
    const me = (await call('GET', '/api/auth/me', { cookie: admin })).data.user;
    expect((await call('DELETE', `/api/admin/users/${me.id}`, { cookie: admin })).status).toBe(409);
    expect(
      (await call('PUT', `/api/admin/users/${me.id}`, { cookie: admin, body: { active: false } })).status,
    ).toBe(409);
  });
});
