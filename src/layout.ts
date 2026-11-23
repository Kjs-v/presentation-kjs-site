/** Header and footer, built from content.site. */
import type { Site } from '../content/content.schema';
import { h } from './lib/dom';
import { icon } from './lib/icons';

/** Slim header: company name and Full screen. Page links live in the corner menu (src/widgets/corner-menu.ts). */
export function header(site: Site): HTMLElement {
  const label = h('span', {}, 'Full screen');
  const fullscreen = h(
    'button',
    { type: 'button', class: 'ctrl', 'aria-pressed': 'false' },
    icon('maximize'),
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
    fullscreen,
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
