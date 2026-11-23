/** Header and footer, built from content.site. */
import type { Site } from '../content/content.schema';
import { h } from './lib/dom';
import { icon } from './lib/icons';
import { nextTheme } from './lib/theme';
import type { NotesPanel } from './widgets/notes';

/**
 * Header: company name, page links (site.nav), and three small controls:
 * Notes, the white / royal blue switch, and Full screen. On narrow screens the links fold into a Menu button.
 */
export function header(site: Site, notes: NotesPanel): HTMLElement {
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

  const themeBtn = h(
    'button',
    {
      type: 'button',
      class: 'ctrl',
      title: site.menu.themeToggleLabel,
      'aria-label': site.menu.themeToggleLabel,
    },
    h('span', { class: 'theme-dot', 'aria-hidden': 'true' }),
  );
  themeBtn.addEventListener('click', () => nextTheme());

  const fullLabel = h('span', { class: 'ctrl-label' }, 'Full screen');
  const fullscreen = h(
    'button',
    { type: 'button', class: 'ctrl', 'aria-pressed': 'false' },
    icon('maximize'),
    fullLabel,
  );
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
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
      { href: '/', 'data-route': true, class: 'wordmark' },
      h('span', { class: 'mark', 'aria-hidden': 'true' }),
      site.name,
    ),
    nav,
    h('div', { class: 'controls' }, notesBtn, themeBtn, fullscreen, menu),
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
        h('img', { src: site.logo, alt: l.label }),
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
          { href: `tel:${contact.phone.replace(/s/g, '')}`, class: 'f-link' },
          icon('phone'),
          contact.phone,
        ),
        h('a', { href: `mailto:${contact.email}`, class: 'f-link' }, icon('mail'), contact.email),
        h(
          'a',
          { href: contact.mapUrl, ...external, class: 'f-link' },
          icon('mapPin', 'icon-map'),
          contact.mapLabel,
        ),
        ...site.links.map(siteLink),
        top,
      ),
    ),
  );
}
