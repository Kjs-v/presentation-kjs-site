/**
 * Content loader edge cases that matter at go-live (code review, 2026-11-27):
 * the database being one step behind the code, and Vercel answering with the page instead of JSON.
 */
import { describe, expect, it } from 'vitest';
import builtIn from '../content/content.json';
import { STORAGE_KEY, resolveContent } from '../src/lib/content';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}
const respond = (body: string, status = 200, type = 'application/json') =>
  (async () => new Response(body, { status, headers: { 'Content-Type': type } })) as typeof fetch;

describe('content loader at go-live', () => {
  it('uses the built-in copy when the database is older than the code (a section is missing)', async () => {
    const { marico: _missing, ...older } = builtIn;
    const { source } = await resolveContent({
      fetch: respond(JSON.stringify(older)),
      storage: memoryStorage(),
    });
    expect(source).toBe('built-in');
  });

  it('uses the built-in copy when /api is answered with the HTML page (wrong rewrite)', async () => {
    const html = respond('<!doctype html><html></html>', 200, 'text/html');
    const { source } = await resolveContent({ fetch: html, storage: memoryStorage() });
    expect(source).toBe('built-in');
  });

  it('ignores a copy saved by the old site that has an older shape', async () => {
    const { marico: _missing, ...older } = builtIn;
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ content: older }) });
    const { source } = await resolveContent({ fetch: respond('', 503), storage });
    expect(source).toBe('built-in');
  });

  it('keeps working when saving the copy fails (storage full)', async () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const { source } = await resolveContent({ fetch: respond(JSON.stringify(builtIn)), storage: full });
    expect(source).toBe('api');
  });

  it('treats a 200 with an empty body as down', async () => {
    const { source } = await resolveContent({ fetch: respond(''), storage: memoryStorage() });
    expect(source).toBe('built-in');
  });
});
