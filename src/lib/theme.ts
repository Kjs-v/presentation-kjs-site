/** Applies site.theme from content as CSS variables, so colours and fonts are editable without code. */
import type { Site } from '../../content/content.schema';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

export function applyTheme(site: Site): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(site.theme.colors))
    root.setProperty(`--color-${kebab(name)}`, value);
  root.setProperty('--font-heading', site.theme.fontHeading);
  root.setProperty('--font-body', site.theme.fontBody);

  if (site.theme.googleFonts.length) {
    const families = site.theme.googleFonts
      .map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700;900')
      .join('&');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.append(link);
  }
}
