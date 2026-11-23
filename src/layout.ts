/** Header and footer, built from content.site. */
import type { Site } from '../content/content.schema';
import { h, routeLink } from './lib/dom';
import { icon } from './lib/icons';

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
