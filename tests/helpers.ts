/** Helpers for calling the API in tests, exactly as the browser would. */
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import content from '../content/content.json';
import { sectionKeys } from '../content/content.schema';
import { db, schema } from '../server/db/client';
import { handle } from '../server/router';

export const ORIGIN = 'http://localhost';
// Every login is an admin. "editor@test.local" is simply a second admin; "legacy@test.local" has an old non-admin role.
export const PASSWORDS = {
  admin: 'admin-password-123',
  editor: 'editor-password-123',
  legacy: 'legacy-password-123',
};

/** Wipes the test database and refills it: all content sections, one history entry, two admins and one legacy login. */
export async function resetDatabase() {
  const d = db();
  await d.execute(
    sql`truncate table login_attempts, notes, media, versions, sections, pitches, users restart identity cascade`,
  );
  for (const key of sectionKeys) {
    const value = (content as Record<string, unknown>)[key];
    await d.insert(schema.sections).values({ key, draft: value, published: value });
  }
  await d.insert(schema.versions).values({ snapshot: content, note: 'Initial content' });
  await d.insert(schema.users).values([
    {
      email: 'admin@test.local',
      name: 'Test admin',
      role: 'admin',
      mustChangePassword: false,
      passwordHash: await bcrypt.hash(PASSWORDS.admin, 4),
    },
    {
      email: 'editor@test.local',
      name: 'Second admin',
      role: 'admin',
      mustChangePassword: false,
      passwordHash: await bcrypt.hash(PASSWORDS.editor, 4),
    },
    {
      email: 'legacy@test.local',
      name: 'Old non-admin login',
      role: 'editor',
      mustChangePassword: false,
      passwordHash: await bcrypt.hash(PASSWORDS.legacy, 4),
    },
  ]);
}

type CallOptions = { body?: unknown; cookie?: string; origin?: string | null };

export async function call(method: string, path: string, options: CallOptions = {}) {
  const headers = new Headers();
  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await handle(
    new Request(ORIGIN + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { status: response.status, data, headers: response.headers, cookie: setCookie.split(';')[0] };
}

export async function loginAs(email: string, password: string) {
  const res = await call('POST', '/api/auth/login', { body: { email, password } });
  if (res.status !== 200)
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  return res.cookie;
}
