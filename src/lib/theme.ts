/** Applies site.theme from content as CSS variables, so colours and fonts are editable without code. */
import type { Site } from '../../content/content.schema';

export function applyTheme(site: Site): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(site.theme.colors)) root.setProperty(`--color-${name}`, value);
  root.setProperty('--font-heading', `'${site.theme.fontHeading}', Georgia, serif`);
  root.setProperty('--font-body', `'${site.theme.fontBody}', system-ui, sans-serif`);

  const families = [site.theme.fontHeading, site.theme.fontBody]
    .map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700')
    .join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.append(link);

  document.title = site.name;
}
