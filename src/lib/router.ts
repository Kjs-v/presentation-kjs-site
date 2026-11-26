/** Minimal history-API router. Routes are registered in src/main.ts. */
import type { Content } from '../../content/content.schema';

export type Page = (content: Content, params: Record<string, string>) => HTMLElement;
type Route = { pattern: RegExp; keys: string[]; page: Page };

const routes: Route[] = [];
const redirects = new Map<string, string>();

/** Old addresses that now live elsewhere, so saved links and bookmarks keep working. */
export function redirect(from: string, to: string): void {
  redirects.set(from, to);
}
const listeners: ((pathname: string) => void)[] = [];

/** `path` may contain params, e.g. "/:unitId" or "/:unitId/:tab". */
export function route(path: string, page: Page): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:([a-zA-Z]+)/g, (_, key: string) => (keys.push(key), '([^/]+)')) + '/?$',
  );
  routes.push({ pattern, keys, page });
}

/** Run something after every page change (e.g. effects, page title). */
export function onRoute(listener: (pathname: string) => void): void {
  listeners.push(listener);
}

const section = (pathname: string) => pathname.split('/')[1] ?? '';

export function startRouter(outlet: HTMLElement, content: Content, notFound: Page): void {
  let previous = '';
  const render = () => {
    let pathname = location.pathname.replace(/\/$/, '') || '/';
    const moved = redirects.get(pathname);
    if (moved) {
      history.replaceState(null, '', moved);
      pathname = moved;
    }
    let page = notFound;
    let params: Record<string, string> = {};
    for (const r of routes) {
      const match = pathname.match(r.pattern);
      if (match) {
        page = r.page;
        params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
        break;
      }
    }
    outlet.replaceChildren(page(content, params));
    // Moving between tabs of the same page (e.g. /unit-1/products → /unit-1/about) keeps the scroll position.
    if (section(pathname) !== section(previous)) window.scrollTo(0, 0);
    previous = pathname;
    outlet.dataset.page = pathname;
    listeners.forEach((l) => l(pathname));
  };

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-route]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.pathname !== location.pathname) history.pushState(null, '', link.pathname);
    render();
  });
  window.addEventListener('popstate', render);
  render();
}
