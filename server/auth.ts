/**
 * Staff login.
 * - Passwords are bcrypt hashes.
 * - The login is a signed token in an httpOnly cookie (7 days). It carries the user's session_version,
 *   so removing a user or resetting their password ends every existing login at once.
 * - Repeated wrong passwords are slowed down (login_attempts table).
 */
import bcrypt from 'bcryptjs';
import { and, eq, gt, sql } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { db, schema } from './db/client.js';
import { HttpError, clientIp } from './http.js';

export const COOKIE = 'kjs_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const WINDOW_MINUTES = 15;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;
export const MIN_PASSWORD_LENGTH = 10;

export type User = typeof schema.users.$inferSelect;
export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'mustChangePassword'>;

export const publicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
});

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(s);
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export function checkNewPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)
    throw new HttpError(400, `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.toLowerCase() === 'password' || /^(.)\1+$/.test(password))
    throw new HttpError(400, 'Please choose a less obvious password.');
  return password;
}

export async function createSessionCookie(user: User, request: Request): Promise<string> {
  const token = await new SignJWT({ sv: user.sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  return cookie(token, MAX_AGE_SECONDS, request);
}

export function clearSessionCookie(request: Request): string {
  return cookie('', 0, request);
}

function cookie(value: string, maxAge: number, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return undefined;
}

/** The logged-in user, or undefined. */
export async function currentUser(request: Request): Promise<User | undefined> {
  const token = readCookie(request);
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const [user] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, Number(payload.sub)));
    if (!user || !user.active || user.sessionVersion !== payload.sv) return undefined;
    return user;
  } catch {
    return undefined;
  }
}

/**
 * Requires a logged-in admin. Every staff login is an admin (there is no lower role); any other role
 * left in the database is refused. Until they choose their own password, only the endpoints that let them
 * do that are open (pass allowPasswordChangePending for those).
 */
export async function requireUser(
  request: Request,
  options: { allowPasswordChangePending?: boolean } = {},
): Promise<User> {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'Please log in.');
  if (user.role !== 'admin') throw new HttpError(403, 'Only admins can use the admin area.');
  if (user.mustChangePassword && !options.allowPasswordChangePending)
    throw new HttpError(403, 'Please choose a new password first.');
  return user;
}

export async function login(request: Request, email: string, password: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const ip = clientIp(request);
  const since = sql`now() - interval '${sql.raw(String(WINDOW_MINUTES))} minutes'`;
  const d = db();

  const [byEmail] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.email, normalized),
        eq(schema.loginAttempts.success, false),
        gt(schema.loginAttempts.createdAt, since),
      ),
    );
  const [byIp] = ip
    ? await d
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.loginAttempts)
        .where(
          and(
            eq(schema.loginAttempts.ip, ip),
            eq(schema.loginAttempts.success, false),
            gt(schema.loginAttempts.createdAt, since),
          ),
        )
    : [{ n: 0 }];
  if (byEmail.n >= MAX_FAILS_PER_EMAIL || byIp.n >= MAX_FAILS_PER_IP)
    throw new HttpError(
      429,
      `Too many wrong passwords. Please wait ${WINDOW_MINUTES} minutes and try again.`,
    );

  const [user] = await d
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${normalized}`);
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal valid emails.
  const ok = await bcrypt.compare(
    password,
    user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7aZfh9Kj8yS0qeMh5tPHQvEp1J8Xo2a',
  );
  const success = Boolean(user && user.active && ok);
  await d.insert(schema.loginAttempts).values({ email: normalized, ip, success });
  if (!success) throw new HttpError(401, 'Wrong email or password.');

  const [updated] = await d
    .update(schema.users)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.users.id, user!.id))
    .returning();
  return updated;
}
