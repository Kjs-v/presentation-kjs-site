/** Header and footer, built from content.site. */
import type { Site } from '../content/content.schema';
import { h, routeLink } from './lib/dom';

export function header(site: Site): HTMLElement {
  const menu = h('button', { type: 'button', id: 'mobile-menu', 'aria-expanded': 'false' }, 'Menu');
  menu.addEventListener('click', () => {
    const open = document.body.classList.toggle('mobile-open');
    menu.setAttribute('aria-expanded', String(open));
    menu.textContent = open ? 'Close menu' : 'Menu';
  });

  const label = h('span', {}, 'Full screen');
  const fullscreen = h(
    'button',
    { type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'corners', 'aria-hidden': 'true' }),
    label,
  );
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    fullscreen.setAttribute('aria-pressed', String(full));
    label.textContent = full ? 'Exit full screen' : 'Full screen';
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
    h('nav', { 'aria-label': 'Main' }, ...site.nav.map((n) => routeLink(n.path, n.label))),
    h('div', { class: 'controls' }, menu, fullscreen),
  );
}

export function footer(site: Site): HTMLElement {
  const { contact } = site;
  const top = h(
    'button',
    { type: 'button', class: 'secondary' },
    'Back to top ',
    h('span', { 'aria-hidden': 'true' }, '↟'),
  );
  top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  return h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'footer-inner' },
      h('div', {}, h('strong', {}, site.name), h('p', {}, contact.address)),
      h(
        'div',
        { class: 'footer-links' },
        h('a', { href: `tel:${contact.phone.replace(/\s/g, '')}` }, contact.phone),
        h('a', { href: `mailto:${contact.email}` }, contact.email),
        h('a', { href: contact.mapUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Find us'),
        ...site.links.map((l) =>
          h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label),
        ),
        top,
      ),
    ),
  );
}
