/**
 * The navigator: a gold KJS coin in the bottom-right corner.
 * Click it to fan out the pages (site.nav) plus Notes along two arcs; choosing anything closes it.
 * A small two-tone coin next to the button switches the colour theme (white / royal blue).
 */
import type { Site } from '../../content/content.schema';
import { h } from '../lib/dom';
import { icon, type IconName } from '../lib/icons';
import { nextTheme } from '../lib/theme';
import { notesPanel } from './notes';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The gold coin with the KJS swoosh; turns into a + (rotated to ×) when open. */
function coinMark(): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="coin-mark" viewBox="0 0 68 68" aria-hidden="true">
    <defs><linearGradient id="kjs-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9de86"/><stop offset=".5" stop-color="#f4b952"/><stop offset="1" stop-color="#d9951c"/></linearGradient></defs>
    <circle cx="34" cy="34" r="32" fill="url(#kjs-gold)"/>
    <circle cx="34" cy="34" r="28.5" fill="none" stroke="#fff" stroke-opacity=".35"/>
    <path class="swoosh" d="M12 47 C22 31 36 21 54 17 C41 26 32 36 26 55 C21 53 16 50 12 47 Z" fill="#4f545c"/>
    <g class="cross" stroke="#16213a" stroke-width="4" stroke-linecap="round"><path d="M25 34h18"/><path d="M34 25v18"/></g>
  </svg>`;
  return t.content.firstElementChild as SVGSVGElement;
}

/** Tagline running round the rim of the open menu. */
function rim(text: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rim');
  svg.setAttribute('viewBox', '0 0 600 600');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><path id="rim-path" d="M300,300 m-276,0 a276,276 0 1,1 552,0 a276,276 0 1,1 -552,0"/></defs><text><textPath href="#rim-path"></textPath></text>`;
  svg.querySelector('textPath')!.textContent = text;
  return svg;
}

type Entry = { label: string; icon: IconName; path?: string; notes?: boolean };

export function cornerMenu(site: Site): HTMLElement {
  const { element: notesEl, api: notes } = notesPanel(() => (badge.hidden = !notes.hasNotes()));

  const fan = h(
    'nav',
    { class: 'fan', id: 'corner-fan', 'aria-label': 'Main menu' },
    h('div', { class: 'disc', 'aria-hidden': 'true' }),
    h('div', { class: 'guide g1', 'aria-hidden': 'true' }),
    h('div', { class: 'guide g2', 'aria-hidden': 'true' }),
    rim(site.menu.rimText),
  );
  const badge = h('span', { class: 'fab-badge', hidden: true });
  const fab = h(
    'button',
    {
      type: 'button',
      class: 'fab',
      'aria-expanded': 'false',
      'aria-controls': 'corner-fan',
      'aria-label': 'Open menu',
    },
    coinMark(),
    badge,
  );
  const toggle = h('button', {
    type: 'button',
    class: 'theme-toggle',
    'aria-label': site.menu.themeToggleLabel,
    title: site.menu.themeToggleLabel,
  });
  const dock = h('div', { class: 'dock' }, fan, toggle, fab);

  // Outer arc: the first four pages. Inner arc: the rest, with Notes in the middle.
  const pages: Entry[] = site.nav.map((n) => ({ label: n.label, icon: n.icon, path: n.path }));
  const outer = pages.slice(0, 4);
  const rest = pages.slice(4);
  const inner: Entry[] = [
    ...rest.slice(0, Math.ceil(rest.length / 2)),
    { label: site.menu.notesLabel, icon: 'notebookPen', notes: true },
    ...rest.slice(Math.ceil(rest.length / 2)),
  ];

  let index = 0;
  const place = (list: Entry[], radiusVar: string) =>
    list.forEach((entry, i) => {
      const start = 192;
      const end = 260;
      const angle = list.length === 1 ? 226 : start + ((end - start) / (list.length - 1)) * i;
      const item = entry.path
        ? h('a', { href: entry.path, 'data-route': true, class: 'item' })
        : h('button', { type: 'button', class: 'item notes-item' });
      item.style.setProperty('--a', `${angle}deg`);
      item.style.setProperty('--r', `var(${radiusVar})`);
      item.style.setProperty('--i', String(index++));
      item.append(h('span', { class: 'coin' }, icon(entry.icon)), h('span', { class: 'label' }, entry.label));
      item.addEventListener('click', () => {
        setOpen(false);
        if (entry.notes) notes.open();
      });
      fan.append(item);
    });
  place(outer, '--r2');
  place(inner, '--r1');

  const setOpen = (open: boolean) => {
    dock.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', String(open));
    fab.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    fan.querySelectorAll<HTMLElement>('.item').forEach((el) => (el.tabIndex = open ? 0 : -1));
    toggle.tabIndex = open ? 0 : -1;
  };
  setOpen(false);
  badge.hidden = !notes.hasNotes();

  fab.addEventListener('click', () => setOpen(!dock.classList.contains('open')));
  toggle.addEventListener('click', () => nextTheme()); // keeps the menu open so you can compare
  document.addEventListener('click', (e) => {
    if (dock.classList.contains('open') && !dock.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dock.classList.contains('open')) setOpen(false);
  });

  return h('div', { class: 'corner-menu' }, dock, notesEl);
}

/** Marks the current page in the menu. Called after every route change. */
export function markCurrent(pathname: string): void {
  const section = (p: string) => p.split('/')[1] ?? '';
  document.querySelectorAll<HTMLAnchorElement>('.corner-menu a.item').forEach((a) => {
    const active = a.pathname === '/' ? pathname === '/' : section(pathname) === section(a.pathname);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
