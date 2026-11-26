/** Header and footer, built from content.site. */
import type { Content, Site } from '../content/content.schema';
import { h } from './lib/dom';
import { icon } from './lib/icons';
import { colourMenu } from './widgets/colour-menu';
import { downloadMenu } from './widgets/download';
import type { NotesPanel } from './widgets/notes';

/**
 * Header: the round logo mark (site.icon), page links (site.nav), and four small controls:
 * Notes, Download PDF, the colour menu, and Full screen (also the F key on any page; Esc exits). On narrow screens the links fold into a Menu button.
 */
export function header(content: Content, notes: NotesPanel): HTMLElement {
  const { site } = content;
  const nav = h(
    'nav',
    { 'aria-label': 'Main', id: 'main-nav' },
    ...site.nav.map((n) => h('a', { href: n.path, 'data-route': true }, n.label)),
  );

  const menu = h(
    'button',
    { type: 'button', class: 'ctrl menu-btn', 'aria-expanded': 'false', 'aria-controls': 'main-nav' },
    'Menu',
  );
  menu.addEventListener('click', () => {
    const open = document.body.classList.toggle('mobile-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', () => {
    document.body.classList.remove('mobile-open');
    menu.setAttribute('aria-expanded', 'false');
  });

  const badge = h('span', { class: 'notes-badge', hidden: !notes.hasNotes() });
  const notesBtn = h(
    'button',
    { type: 'button', class: 'ctrl', title: site.menu.notesLabel },
    icon('notebookPen'),
    h('span', { class: 'ctrl-label' }, site.menu.notesLabel),
    badge,
  );
  notesBtn.addEventListener('click', () => (notes.isOpen() ? notes.close() : notes.open()));
  notes.onSaved(() => (badge.hidden = !notes.hasNotes()));

  const themeBtn = colourMenu(site);

  const fullLabel = h('span', { class: 'ctrl-label' }, 'Full screen');
  const fullscreen = h(
    'button',
    { type: 'button', class: 'ctrl', 'aria-pressed': 'false' },
    icon('maximize'),
    fullLabel,
  );
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  fullscreen.addEventListener('click', toggleFullscreen);
  // F toggles full screen on every page (Esc leaves it, as browsers do). Ignored while typing.
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    e.preventDefault();
    toggleFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    fullscreen.setAttribute('aria-pressed', String(full));
    fullLabel.textContent = full ? 'Exit full screen' : 'Full screen';
  });

  return h(
    'header',
    { class: 'topbar' },
    h(
      'a',
      { href: '/', 'data-route': true, class: 'wordmark', 'aria-label': `${site.name} home` },
      h('img', { src: site.icon, alt: '', class: 'brand-mark' }),
    ),
    nav,
    h('div', { class: 'controls' }, notesBtn, downloadMenu(content), themeBtn, fullscreen, menu),
  );
}

/** Highlights the current section in the header (so /unit-1/products highlights "Unit 1"). */
export function markCurrent(pathname: string): void {
  const section = (p: string) => p.split('/')[1] ?? '';
  document.querySelectorAll<HTMLAnchorElement>('#main-nav a').forEach((a) => {
    const active = a.pathname === '/' ? pathname === '/' : section(pathname) === section(a.pathname);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/**
 * "Find us": hovering (or clicking, on touch screens) opens a small list of the locations
 * in content.site.contact.locations; each one opens its Google Maps link in a new tab.
 */
function findUs(contact: Site['contact']): HTMLElement {
  const button = h(
    'button',
    { type: 'button', class: 'f-link', 'aria-expanded': 'false', 'aria-haspopup': 'true' },
    icon('mapPin', 'icon-map'),
    contact.mapLabel,
  );
  const menu = h(
    'div',
    { class: 'find-menu' },
    ...contact.locations.map((l) =>
      h(
        'a',
        { href: l.mapUrl, target: '_blank', rel: 'noopener noreferrer', class: 'find-place' },
        h('strong', {}, l.label),
        h('span', {}, l.address),
      ),
    ),
  );
  const root = h('div', { class: 'find-us' }, button, menu);
  const set = (open: boolean) => {
    root.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => set(!root.classList.contains('open')));
  root.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && set(true));
  root.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && set(false));
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget as Node | null)) set(false);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      set(false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target as Node)) set(false);
  });
  return root;
}

/** Footer: address, then phone, email, map, KJS website (logo) and LinkedIn, all from content.site. */
export function footer(site: Site): HTMLElement {
  const { contact } = site;
  const external = { target: '_blank', rel: 'noopener noreferrer' };
  const top = h(
    'button',
    { type: 'button', class: 'f-link' },
    'Back to top ',
    h('span', { 'aria-hidden': 'true' }, '↟'),
  );
  top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  const siteLink = (l: Site['links'][number]) => {
    if (l.icon === 'logo')
      return h(
        'a',
        { href: l.url, ...external, class: 'f-link f-logo', 'aria-label': l.label },
        // Dark lettering on light themes, white lettering on the dark (royal) theme.
        h('img', { src: site.logoOnLight, alt: l.label, class: 'logo-on-light' }),
        h('img', { src: site.logo, alt: '', class: 'logo-on-dark' }),
      );
    return h(
      'a',
      { href: l.url, ...external, class: 'f-link' },
      icon(l.icon, l.icon === 'linkedin' ? 'icon-linkedin' : ''),
      l.label,
    );
  };

  return h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'footer-inner' },
      h('div', { class: 'footer-company' }, h('strong', {}, site.name), h('p', {}, contact.address)),
      h(
        'div',
        { class: 'footer-links' },
        h(
          'a',
          { href: `tel:${contact.phone.replace(/\s/g, '')}`, class: 'f-link' },
          icon('phone'),
          contact.phone,
        ),
        h('a', { href: `mailto:${contact.email}`, class: 'f-link' }, icon('mail'), contact.email),
        findUs(contact),
        ...site.links.map(siteLink),
        top,
      ),
    ),
  );
}
