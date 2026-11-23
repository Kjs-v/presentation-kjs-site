/** Minimal history-API router. Routes are registered in src/main.ts. */
import type { Content } from '../../content/content.schema';

export type Page = (content: Content, params: Record<string, string>) => HTMLElement;
type Route = { pattern: RegExp; keys: string[]; page: Page };

const routes: Route[] = [];

/** `path` may contain params, e.g. "/:unitId". */
export function route(path: string, page: Page): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:([a-zA-Z]+)/g, (_, key: string) => (keys.push(key), '([^/]+)')) + '/?$',
  );
  routes.push({ pattern, keys, page });
}

export function startRouter(outlet: HTMLElement, content: Content, notFound: Page): void {
  const render = () => {
    const pathname = location.pathname;
    for (const r of routes) {
      const match = pathname.match(r.pattern);
      if (match) {
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
        outlet.replaceChildren(r.page(content, params));
        window.scrollTo(0, 0);
        markActive(pathname);
        return;
      }
    }
    outlet.replaceChildren(notFound(content, {}));
  };

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-route]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (link.pathname !== location.pathname) history.pushState(null, '', link.pathname);
    render();
  });
  window.addEventListener('popstate', render);
  render();
}

function markActive(pathname: string): void {
  document.querySelectorAll<HTMLAnchorElement>('nav a[data-route]').forEach((a) => {
    a.toggleAttribute('aria-current', a.pathname === pathname);
  });
}
