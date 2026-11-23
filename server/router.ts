/**
 * Every /api endpoint, in one place. Vercel runs this through a single function (api/index.ts),
 * because the free plan allows at most 12 functions; the dev server and the tests call handle() directly.
 *
 * Public:  GET /api/health, GET /api/content
 * Login:   POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me, POST /api/auth/change-password
 * Staff:   /api/admin/sections…, /api/admin/publish, /api/admin/versions…, /api/admin/media…, /api/admin/schema,
 *          /api/admin/notes…
 *          /api/admin/users… (every login is an admin; there is no lower role)
 */
import { randomBytes } from 'node:crypto';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import bcrypt from 'bcryptjs';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { contentSections, sectionKeys } from '../content/content.schema.js';
import {
  checkNewPassword,
  clearSessionCookie,
  createSessionCookie,
  currentUser,
  hashPassword,
  login,
  publicUser,
  requireUser,
} from './auth.js';
import {
  discardDraft,
  getSection,
  isSectionKey,
  mediaUsage,
  publish,
  publishedContent,
  restore,
  saveDraft,
  sectionList,
  versionList,
} from './content-store.js';
import { db, schema } from './db/client.js';
import { HttpError, assertSameOrigin, errorResponse, json, readJson } from './http.js';

type Params = Record<string, string>;
type Handler = (request: Request, params: Params) => Promise<Response>;
type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

const routes: Route[] = [];
function on(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:([a-zA-Z]+)/g, (_, k: string) => (keys.push(k), '([^/]+)')) + '/?$',
  );
  routes.push({ method, pattern, keys, handler });
}

const asString = (v: unknown, field: string, max = 200): string => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required.`);
  return v.trim().slice(0, max);
};
const asId = (v: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
  return n;
};
const tempPassword = () => randomBytes(9).toString('base64url');

// ---------- Public ----------
on('GET', '/api/health', async () => json({ ok: true }));

on('GET', '/api/content', async () =>
  json(await publishedContent(), {
    // Served from Vercel's cache; refreshed in the background so a sleeping database never slows visitors.
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' },
  }),
);

// ---------- Login ----------
on('POST', '/api/auth/login', async (request) => {
  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  const user = await login(
    request,
    asString(body.email, 'Email'),
    typeof body.password === 'string' ? body.password : '',
  );
  return json(
    { user: publicUser(user) },
    { headers: { 'Set-Cookie': await createSessionCookie(user, request) } },
  );
});

on('POST', '/api/auth/logout', async (request) =>
  json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(request) } }),
);

on('GET', '/api/auth/me', async (request) => {
  const user = await currentUser(request);
  return json({ user: user ? publicUser(user) : null });
});

on('POST', '/api/auth/change-password', async (request) => {
  const user = await requireUser(request, { allowPasswordChangePending: true });
  const body = await readJson<{ currentPassword?: unknown; newPassword?: unknown }>(request);
  if (
    typeof body.currentPassword !== 'string' ||
    !(await bcrypt.compare(body.currentPassword, user.passwordHash))
  )
    throw new HttpError(400, 'Your current password is not correct.');
  const newPassword = checkNewPassword(body.newPassword);
  const [updated] = await db()
    .update(schema.users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      sessionVersion: sql`${schema.users.sessionVersion} + 1`, // signs out other devices
    })
    .where(eq(schema.users.id, user.id))
    .returning();
  return json(
    { user: publicUser(updated) },
    { headers: { 'Set-Cookie': await createSessionCookie(updated, request) } },
  );
});

// ---------- Content (staff) ----------
on('GET', '/api/admin/sections', async (request) => {
  await requireUser(request);
  return json({ sections: await sectionList() });
});

on('GET', '/api/admin/sections/:key', async (request, { key }) => {
  await requireUser(request);
  if (!isSectionKey(key)) throw new HttpError(404, 'Section not found.');
  return json(await getSection(key));
});

on('PUT', '/api/admin/sections/:key', async (request, { key }) => {
  const user = await requireUser(request);
  if (!isSectionKey(key)) throw new HttpError(404, 'Section not found.');
  const body = await readJson<{ data?: unknown; version?: unknown }>(request);
  return json(await saveDraft(key, body.data, body.version, user.id));
});

on('POST', '/api/admin/sections/:key/discard', async (request, { key }) => {
  const user = await requireUser(request);
  if (!isSectionKey(key)) throw new HttpError(404, 'Section not found.');
  return json(await discardDraft(key, user.id));
});

on('POST', '/api/admin/publish', async (request) => {
  const user = await requireUser(request);
  const body = await readJson<{ note?: unknown }>(request).catch(() => ({ note: '' }));
  return json(await publish(user.id, typeof body.note === 'string' ? body.note : ''));
});

on('GET', '/api/admin/versions', async (request) => {
  await requireUser(request);
  return json({ versions: await versionList() });
});

on('POST', '/api/admin/versions/:id/restore', async (request, { id }) => {
  const user = await requireUser(request);
  return json(await restore(asId(id), user.id));
});

// The fields of every section, with their plain-English labels, so the admin page can build its forms.
let schemaCache: unknown;
on('GET', '/api/admin/schema', async (request) => {
  await requireUser(request);
  schemaCache ??= {
    sections: sectionKeys,
    schema: zodToJsonSchema(contentSections, { $refStrategy: 'none', target: 'jsonSchema7' }),
  };
  return json(schemaCache);
});

// ---------- Media (staff) ----------
const ALLOWED_UPLOADS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'application/pdf',
];
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const BLOB_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//;

/**
 * Direct-to-Blob uploads: the browser asks here for a short-lived upload token, then sends the file
 * straight to Vercel Blob (functions only accept 4.5 MB). Blob calls back here when the upload finishes.
 */
on('POST', '/api/admin/media/upload', async (request) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new HttpError(503, 'File uploads are not set up yet (Vercel Blob).');
  const body = await readJson<HandleUploadBody>(request);
  let uploaderId: number | undefined;
  if (body.type === 'blob.generate-client-token') {
    assertSameOrigin(request);
    uploaderId = (await requireUser(request)).id;
  }
  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: ALLOWED_UPLOADS,
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      addRandomSuffix: true,
      tokenPayload: JSON.stringify({ uploaderId }),
    }),
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const { uploaderId: by } = JSON.parse(tokenPayload ?? '{}') as { uploaderId?: number };
      await db()
        .insert(schema.media)
        .values({
          url: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType ?? '',
          uploadedBy: by ?? null,
        })
        .onConflictDoNothing();
    },
  });
  return json(result);
});

/** Records an uploaded file (the admin page calls this after an upload, in case Blob's callback can't reach us). */
on('POST', '/api/admin/media', async (request) => {
  const user = await requireUser(request);
  const body = await readJson<{
    url?: unknown;
    pathname?: unknown;
    contentType?: unknown;
    size?: unknown;
    alt?: unknown;
  }>(request);
  const url = asString(body.url, 'url', 1000);
  if (!BLOB_URL.test(url)) throw new HttpError(400, 'Only files uploaded to the site storage can be added.');
  const [row] = await db()
    .insert(schema.media)
    .values({
      url,
      pathname: typeof body.pathname === 'string' ? body.pathname.slice(0, 500) : new URL(url).pathname,
      contentType: typeof body.contentType === 'string' ? body.contentType.slice(0, 100) : '',
      size: Number.isInteger(body.size) ? (body.size as number) : 0,
      alt: typeof body.alt === 'string' ? body.alt.slice(0, 300) : '',
      uploadedBy: user.id,
    })
    .onConflictDoUpdate({ target: schema.media.url, set: { alt: sql`excluded.alt` } })
    .returning();
  return json({ media: row }, { status: 201 });
});

on('GET', '/api/admin/media', async (request) => {
  await requireUser(request);
  const rows = await db().select().from(schema.media).orderBy(desc(schema.media.id)).limit(500);
  return json({ media: rows });
});

on('DELETE', '/api/admin/media/:id', async (request, { id }) => {
  await requireUser(request);
  const [row] = await db()
    .select()
    .from(schema.media)
    .where(eq(schema.media.id, asId(id)));
  if (!row) throw new HttpError(404, 'File not found.');
  const usedIn = await mediaUsage(row.url);
  if (usedIn.length)
    throw new HttpError(409, `This file is still used in: ${usedIn.join(', ')}. Remove it there first.`, {
      usedIn,
    });
  if (process.env.BLOB_READ_WRITE_TOKEN && BLOB_URL.test(row.url)) await del(row.url);
  await db().delete(schema.media).where(eq(schema.media.id, row.id));
  return json({ ok: true });
});

// ---------- Meeting notes (staff) ----------
const NOTE_LIMITS = { visitor: 200, company: 200, body: 20_000 };
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const noteColumns = {
  id: schema.notes.id,
  clientId: schema.notes.clientId,
  visitor: schema.notes.visitor,
  company: schema.notes.company,
  body: schema.notes.body,
  createdAt: schema.notes.createdAt,
  updatedAt: schema.notes.updatedAt,
  createdBy: schema.notes.createdBy,
};

function noteFields(body: { visitor?: unknown; company?: unknown; body?: unknown }) {
  const text = (v: unknown, field: keyof typeof NOTE_LIMITS) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
    if (v.length > NOTE_LIMITS[field])
      throw new HttpError(400, `${field} is too long (max ${NOTE_LIMITS[field]} characters).`);
    return v;
  };
  const fields = {
    visitor: text(body.visitor, 'visitor').trim(),
    company: text(body.company, 'company').trim(),
    body: text(body.body, 'body'),
  };
  if (!fields.visitor && !fields.company && !fields.body.trim())
    throw new HttpError(400, 'The note is empty.');
  return fields;
}

const canEditNote = (user: { id: number; role: string }, createdBy: number | null) =>
  user.role === 'admin' || createdBy === user.id;

on('GET', '/api/admin/notes', async (request) => {
  await requireUser(request);
  const rows = await db()
    .select({ ...noteColumns, createdByEmail: schema.users.email })
    .from(schema.notes)
    .leftJoin(schema.users, eq(schema.users.id, schema.notes.createdBy))
    .orderBy(desc(schema.notes.updatedAt))
    .limit(200);
  return json({ notes: rows });
});

/**
 * Saves a note. The browser sends the same clientId every time it saves the same note, so retries
 * (e.g. after the connection comes back) update that note instead of creating duplicates.
 */
on('POST', '/api/admin/notes', async (request) => {
  const user = await requireUser(request);
  const body = await readJson<{ clientId?: unknown; visitor?: unknown; company?: unknown; body?: unknown }>(
    request,
  );
  if (typeof body.clientId !== 'string' || !CLIENT_ID.test(body.clientId))
    throw new HttpError(400, 'Missing or invalid note id.');
  const fields = noteFields(body);
  const [existing] = await db()
    .select({ id: schema.notes.id, createdBy: schema.notes.createdBy })
    .from(schema.notes)
    .where(eq(schema.notes.clientId, body.clientId));
  if (existing && !canEditNote(user, existing.createdBy))
    throw new HttpError(403, 'Only the person who wrote this note (or an admin) can change it.');
  const [row] = existing
    ? await db()
        .update(schema.notes)
        .set({ ...fields, updatedAt: new Date(), updatedBy: user.id })
        .where(eq(schema.notes.id, existing.id))
        .returning(noteColumns)
    : await db()
        .insert(schema.notes)
        .values({ ...fields, clientId: body.clientId, createdBy: user.id, updatedBy: user.id })
        .onConflictDoNothing({ target: schema.notes.clientId })
        .returning(noteColumns);
  if (!row) throw new HttpError(409, 'This note was just saved from another device. Please save again.');
  return json({ note: row }, { status: existing ? 200 : 201 });
});

on('DELETE', '/api/admin/notes/:id', async (request, { id }) => {
  const user = await requireUser(request);
  const [note] = await db()
    .select({ id: schema.notes.id, createdBy: schema.notes.createdBy })
    .from(schema.notes)
    .where(eq(schema.notes.id, asId(id)));
  if (!note) throw new HttpError(404, 'Note not found.');
  if (!canEditNote(user, note.createdBy))
    throw new HttpError(403, 'Only the person who wrote this note (or an admin) can delete it.');
  await db().delete(schema.notes).where(eq(schema.notes.id, note.id));
  return json({ ok: true });
});

// ---------- Users (admins) ----------
const userColumns = {
  id: schema.users.id,
  email: schema.users.email,
  name: schema.users.name,
  role: schema.users.role,
  active: schema.users.active,
  mustChangePassword: schema.users.mustChangePassword,
  lastLoginAt: schema.users.lastLoginAt,
  createdAt: schema.users.createdAt,
};

on('GET', '/api/admin/users', async (request) => {
  await requireUser(request);
  return json({ users: await db().select(userColumns).from(schema.users).orderBy(schema.users.id) });
});

/** Adds an admin login. Returns a temporary password once; they must change it at first login. */
on('POST', '/api/admin/users', async (request) => {
  await requireUser(request);
  const body = await readJson<{ email?: unknown; name?: unknown }>(request);
  const email = asString(body.email, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HttpError(400, 'That email address does not look right.');
  const password = tempPassword();
  const [existing] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`);
  if (existing) throw new HttpError(409, 'A login with that email already exists.');
  const [row] = await db()
    .insert(schema.users)
    .values({
      email,
      name: typeof body.name === 'string' ? body.name.slice(0, 100) : '',
      role: 'admin', // every login is an admin
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    })
    .returning(userColumns);
  return json({ user: row, temporaryPassword: password }, { status: 201 });
});

async function assertNotLastAdmin(userId: number) {
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(and(eq(schema.users.role, 'admin'), eq(schema.users.active, true), ne(schema.users.id, userId)));
  if (n === 0) throw new HttpError(409, 'There must always be at least one active admin.');
}

on('PUT', '/api/admin/users/:id', async (request, { id }) => {
  const me = await requireUser(request);
  const userId = asId(id);
  const body = await readJson<{ name?: unknown; active?: unknown }>(request);
  const changes: Partial<typeof schema.users.$inferInsert> = {};
  if (typeof body.name === 'string') changes.name = body.name.slice(0, 100);
  if (typeof body.active === 'boolean') changes.active = body.active;
  if (changes.active === false && userId === me.id)
    throw new HttpError(409, 'You cannot remove your own admin access.');
  if (changes.active === false) await assertNotLastAdmin(userId);
  const [row] = await db()
    .update(schema.users)
    .set({
      ...changes,
      ...(changes.active === false ? { sessionVersion: sql`${schema.users.sessionVersion} + 1` } : {}),
    })
    .where(eq(schema.users.id, userId))
    .returning(userColumns);
  if (!row) throw new HttpError(404, 'User not found.');
  return json({ user: row });
});

/** Gives a user a new temporary password and signs them out everywhere. */
on('POST', '/api/admin/users/:id/reset-password', async (request, { id }) => {
  await requireUser(request);
  const password = tempPassword();
  const [row] = await db()
    .update(schema.users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      sessionVersion: sql`${schema.users.sessionVersion} + 1`,
    })
    .where(eq(schema.users.id, asId(id)))
    .returning(userColumns);
  if (!row) throw new HttpError(404, 'User not found.');
  return json({ user: row, temporaryPassword: password });
});

/** Removes access (kept in the database for history) and signs them out everywhere. */
on('DELETE', '/api/admin/users/:id', async (request, { id }) => {
  const me = await requireUser(request);
  const userId = asId(id);
  if (userId === me.id) throw new HttpError(409, 'You cannot remove your own login.');
  await assertNotLastAdmin(userId);
  const [row] = await db()
    .update(schema.users)
    .set({ active: false, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId))
    .returning(userColumns);
  if (!row) throw new HttpError(404, 'User not found.');
  return json({ user: row });
});

// ---------- Entry point ----------
export async function handle(request: Request): Promise<Response> {
  try {
    const { pathname } = new URL(request.url);
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    let methodMismatch = false;
    for (const route of routes) {
      const match = pathname.match(route.pattern);
      if (!match) continue;
      if (route.method !== method) {
        methodMismatch = true;
        continue;
      }
      // Writes must come from our own site. The Blob completion callback is the one exception
      // (it is signed by Vercel and checked inside handleUpload).
      if (pathname !== '/api/admin/media/upload') assertSameOrigin(request);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      return await route.handler(request, params);
    }
    throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Method not allowed.' : 'Not found.');
  } catch (error) {
    return errorResponse(error);
  }
}
