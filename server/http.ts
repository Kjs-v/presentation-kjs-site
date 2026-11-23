/** Small helpers for building JSON responses and reading requests. */
import type { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      { error: error.message, ...(error.details ? { details: error.details } : {}) },
      { status: error.status },
    );
  }
  console.error(error);
  return json({ error: 'Something went wrong on the server.' }, { status: 500 });
}

const MAX_BODY_BYTES = 2_000_000; // content edits are small; files go straight to Blob

export async function readJson<T = unknown>(request: Request): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
  if (!text) throw new HttpError(400, 'Expected a JSON body.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
}

/** Turns Zod issues into a short list the admin page can show next to the right field. */
export function validationError(error: ZodError, prefix: (string | number)[] = []): HttpError {
  const details = error.issues
    .slice(0, 50)
    .map((i) => ({ path: [...prefix, ...i.path].join('.'), message: i.message }));
  return new HttpError(400, 'Some fields are not valid.', details);
}

export function clientIp(request: Request): string {
  return (
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    ''
  );
}

/**
 * Blocks cross-site writes: a POST/PUT/DELETE must come from our own site.
 * (Login cookies are SameSite=Lax as well; this is the second lock.)
 */
export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  if (!origin) throw new HttpError(403, 'Missing Origin header.');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    /* invalid origin */
  }
  if (originHost !== host) throw new HttpError(403, 'Requests from other websites are not allowed.');
}
