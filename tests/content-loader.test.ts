/**
 * The site's content loader: live API first, then the last good copy saved in the browser,
 * then the copy built into the site. Broken data from any source is never used.
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

const withName = (name: string) => ({ ...builtIn, site: { ...builtIn.site, name } });
const ok = (body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
const failing = (async () => {
  throw new TypeError('network down');
}) as typeof fetch;

describe('content loader', () => {
  it('uses the live API and saves a copy for later', async () => {
    const storage = memoryStorage();
    const { content, source } = await resolveContent({ fetch: ok(withName('From API')), storage });
    expect(source).toBe('api');
    expect(content.site.name).toBe('From API');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).content.site.name).toBe('From API');
  });

  it('falls back to the saved copy when the API is down', async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ content: withName('Saved earlier') }) });
    const { content, source } = await resolveContent({ fetch: failing, storage });
    expect(source).toBe('saved');
    expect(content.site.name).toBe('Saved earlier');
  });

  it('falls back to the built-in copy when there is nothing saved', async () => {
    const { content, source } = await resolveContent({ fetch: failing, storage: memoryStorage() });
    expect(source).toBe('built-in');
    expect(content.site.name).toBe(builtIn.site.name);
  });

  it('works when browser storage is blocked', async () => {
    const { source } = await resolveContent({ fetch: failing, storage: undefined });
    expect(source).toBe('built-in');
  });

  it('never uses broken content from the API, even with status 200', async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ content: withName('Saved earlier') }) });
    const { source } = await resolveContent({ fetch: ok({ site: { name: 'half a site' } }), storage });
    expect(source).toBe('saved');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).content.site.name).toBe('Saved earlier'); // not overwritten
  });

  it('ignores a corrupted saved copy', async () => {
    const { source } = await resolveContent({
      fetch: failing,
      storage: memoryStorage({ [STORAGE_KEY]: '{not json' }),
    });
    expect(source).toBe('built-in');
  });

  it('gives up on a slow API after the timeout', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const started = Date.now();
    const { source } = await resolveContent({ fetch: hanging, storage: memoryStorage(), timeoutMs: 200 });
    expect(source).toBe('built-in');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
