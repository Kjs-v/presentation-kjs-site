/**
 * The ONLY place the UI gets content from. Pages never import content.json directly.
 *
 * Order of sources (docs/BACKEND-PLAN.md):
 *   1. the live API (/api/content), which Vercel serves from its cache;
 *   2. the last good copy this browser saved from the API (so a database hiccup never shows stale built-in text);
 *   3. the copy built into the site (content/content.json; refreshed by `npm run db:export` before each deploy).
 * Every copy is checked against the schema before it is used.
 */
import builtIn from '../../content/content.json';
import { contentSchema, type Content } from '../../content/content.schema';

export const STORAGE_KEY = 'kjs-content-v1';
export const API_TIMEOUT_MS = 4000;

export type ContentSource = 'api' | 'saved' | 'built-in';

type Deps = {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  timeoutMs: number;
};

function browserStorage(): Deps['storage'] {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // blocked (private mode, strict settings)
  }
}

async function fromApi(deps: Deps): Promise<Content | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch('/api/content', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return undefined;
    const parsed = contentSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined; // offline, timed out, or not JSON
  } finally {
    clearTimeout(timer);
  }
}

function fromStorage(deps: Deps): Content | undefined {
  try {
    const text = deps.storage?.getItem(STORAGE_KEY);
    if (!text) return undefined;
    const parsed = contentSchema.safeParse(JSON.parse(text).content);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function save(deps: Deps, content: Content) {
  try {
    deps.storage?.setItem(STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), content }));
  } catch {
    /* storage full or blocked: not a problem */
  }
}

/** Loads content and says where it came from. Exported separately so it can be tested without a browser. */
export async function resolveContent(
  overrides: Partial<Deps> = {},
): Promise<{ content: Content; source: ContentSource }> {
  const deps: Deps = {
    fetch: overrides.fetch ?? globalThis.fetch.bind(globalThis),
    storage: 'storage' in overrides ? overrides.storage : browserStorage(),
    timeoutMs: overrides.timeoutMs ?? API_TIMEOUT_MS,
  };
  const live = await fromApi(deps);
  if (live) {
    save(deps, live);
    return { content: live, source: 'api' };
  }
  const saved = fromStorage(deps);
  if (saved) return { content: saved, source: 'saved' };
  return { content: contentSchema.parse(builtIn), source: 'built-in' };
}

let cache: Promise<Content> | undefined;

export function loadContent(): Promise<Content> {
  cache ??= resolveContent().then(({ content, source }) => {
    if (source !== 'api')
      console.info(`[content] using the ${source} copy (the live API was not reachable).`);
    document.documentElement.dataset.contentSource = source;
    return content;
  });
  return cache;
}
