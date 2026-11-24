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
  initColours(site);

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

/* ---------- Custom background colours (header colour menu) ----------
 * A visitor can pick a background colour for one page (its first path segment, so /unit-1/products
 * counts as /unit-1) or for every page. Saved in this browser only. "white" means: no custom colour.
 * The closest palette (light or dark) supplies text colours; the picked colour replaces the backgrounds.
 */
const COLOUR_KEY = 'kjs-colour';
type ColourPrefs = { all: string | null; pages: Record<string, string> };
let palettesCache: Site['theme']['palettes'] = [];
let defaultId = '';

const pageKey = (pathname: string) => '/' + (pathname.split('/')[1] ?? '');

function readPrefs(): ColourPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(COLOUR_KEY) ?? 'null') as ColourPrefs | null;
    if (p && typeof p === 'object') return { all: p.all ?? null, pages: p.pages ?? {} };
  } catch {
    /* storage blocked or bad data */
  }
  return { all: null, pages: {} };
}
function writePrefs(p: ColourPrefs): void {
  try {
    localStorage.setItem(COLOUR_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/** Relative luminance of a #rrggbb colour (0 = black, 1 = white). */
function luminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return 1;
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const OVERRIDES = ['bg', 'surface', 'surface-strong', 'header-bg', 'footer-bg', 'scrim', 'hero-overlay'];

/** Shows a background colour now (without saving). null = back to the saved palette. */
export function previewColour(color: string | null): void {
  const root = document.documentElement;
  OVERRIDES.forEach((n) => root.style.removeProperty(`--c-${n}`));
  delete root.dataset.colour;
  if (!color || color === 'white') {
    root.dataset.theme = defaultId;
    return;
  }
  // Pick the palette whose background is closest in lightness, for readable text on top.
  const lum = luminance(color);
  const base =
    [...palettesCache].sort(
      (a, b) => Math.abs(luminance(a.colors.bg) - lum) - Math.abs(luminance(b.colors.bg) - lum),
    )[0] ?? palettesCache[0];
  root.dataset.theme = base.id;
  root.dataset.colour = color;
  const mix = (pct: number, other = 'var(--c-text)') => `color-mix(in srgb, ${color} ${pct}%, ${other})`;
  const set = (n: string, v: string) => root.style.setProperty(`--c-${n}`, v);
  set('bg', color);
  set('surface', mix(94));
  set('surface-strong', mix(89));
  set('header-bg', mix(95, 'transparent'));
  set('footer-bg', mix(92));
  set('scrim', mix(90, 'transparent'));
  set(
    'hero-overlay',
    `linear-gradient(90deg, ${mix(96, 'transparent')} 0%, ${mix(85, 'transparent')} 36%, ${mix(25, 'transparent')} 66%, transparent)`,
  );
}

/** The colour saved for this page (or for all pages), or null for white. */
export function savedColour(pathname: string): string | null {
  const p = readPrefs();
  const c = p.pages[pageKey(pathname)] ?? p.all;
  return c && c !== 'white' ? c : null;
}

/** Applies the saved colour for a page. Called on every page change. */
export function applyPageColour(pathname: string): void {
  if (new URLSearchParams(location.search).has('theme')) return;
  const c = savedColour(pathname);
  if (c) previewColour(c);
  else {
    previewColour(null);
    setTheme(defaultId);
  }
}

/** Saves a colour ("white" or #rrggbb) for this page only, or for every page, and applies it. */
export function saveColour(color: string, scope: 'page' | 'all', pathname: string): void {
  const p = readPrefs();
  if (scope === 'all') {
    p.all = color === 'white' ? null : color;
    p.pages = {};
  } else {
    p.pages[pageKey(pathname)] = color;
  }
  writePrefs(p);
  applyPageColour(pathname);
}

/** Remembers the palettes so custom colours can borrow text colours from the closest one. */
export function initColours(site: Site): void {
  palettesCache = site.theme.palettes;
  defaultId = site.theme.default;
}

/** Switches to the next palette and returns its id. */
export function nextTheme(): string {
  const next = ids[(ids.indexOf(currentTheme()) + 1) % ids.length];
  setTheme(next);
  return next;
}
