/** Header and footer, built from content.site. */
import type { Site } from '../content/content.schema';
import { h, routeLink } from './lib/dom';

export function header(site: Site): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    h('a', { href: '/', 'data-route': true, class: 'brand' }, h('img', { src: site.logo, alt: site.name })),
    h('nav', { 'aria-label': 'Main' }, ...site.nav.map((n) => routeLink(n.path, n.label))),
  );
}

export function footer(site: Site): HTMLElement {
  const { contact } = site;
  return h(
    'footer',
    { class: 'footer' },
    h('p', {}, h('strong', {}, site.name), ' · ', site.tagline),
    h('p', {}, contact.address),
    h(
      'p',
      {},
      h('a', { href: `tel:${contact.phone.replace(/\s/g, '')}` }, contact.phone),
      ' · ',
      h('a', { href: `mailto:${contact.email}` }, contact.email),
      ' · ',
      h('a', { href: contact.mapUrl, target: '_blank', rel: 'noopener' }, 'Map'),
      ...site.links.flatMap((l) => [
        ' · ',
        h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label),
      ]),
    ),
  );
}
