/**
 * Colour themes from content.site.theme.palettes.
 * Each palette becomes CSS variables (--c-bg, --c-text, ...) under :root[data-theme="<id>"].
 * The visitor's choice is remembered in this browser.
 */
import type { Site } from '../../content/content.schema';

const STORAGE_KEY = 'kjs-theme';
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
let ids: string[] = [];

export function applyTheme(site: Site): void {
  const { theme } = site;
  ids = theme.palettes.map((p) => p.id);

  const css = theme.palettes
    .map((p) => {
      const vars = Object.entries(p.colors)
        .map(([name, value]) => `--c-${kebab(name)}: ${value};`)
        .join(' ');
      return `:root[data-theme="${p.id}"] { ${vars} }`;
    })
    .join('\n');
  const style = document.createElement('style');
  style.id = 'theme-palettes';
  style.textContent =
    css + `\n:root { --font-heading: ${theme.fontHeading}; --font-body: ${theme.fontBody}; }`;
  document.head.append(style);

  if (theme.googleFonts.length) {
    const families = theme.googleFonts
      .map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700;900')
      .join('&');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.append(link);
  }

  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  // ?theme=royal (or white) in the address picks a theme, e.g. for a presentation PC.
  const asked = new URLSearchParams(location.search).get('theme');
  if (asked && ids.includes(asked)) setTheme(asked);
  else setTheme(saved && ids.includes(saved) ? saved : theme.default);
}

export function currentTheme(): string {
  return document.documentElement.dataset.theme ?? ids[0];
}

export function setTheme(id: string): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage blocked */
  }
}

/** Switches to the next palette and returns its id. */
export function nextTheme(): string {
  const next = ids[(ids.indexOf(currentTheme()) + 1) % ids.length];
  setTheme(next);
  return next;
}
