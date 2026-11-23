import type { Page } from '../lib/router';
import { h, routeLink } from '../lib/dom';

export const homePage: Page = ({ home, story }) =>
  h(
    'div',
    { class: 'page home' },
    h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-copy' },
        h('p', { class: 'eyebrow' }, home.eyebrow),
        h('h1', {}, home.title),
        h('p', { class: 'lead' }, home.subtitle),
        h(
          'div',
          { class: 'actions' },
          ...home.buttons.map((b) => routeLink(b.path, b.label, `btn btn-${b.style}`)),
        ),
      ),
      h('img', { src: home.image, alt: '', class: 'hero-image' }),
    ),
    h(
      'section',
      {},
      h('h2', {}, home.partnersTitle),
      h(
        'div',
        { class: 'logo-row' },
        ...home.partners.map((p) => h('img', { src: p.logo, alt: p.name, loading: 'lazy' })),
      ),
    ),
    h(
      'section',
      {},
      h('h2', {}, home.capabilitiesTitle),
      h(
        'div',
        { class: 'card-grid' },
        ...home.capabilities.map((c) =>
          h('article', { class: 'card' }, h('h3', {}, c.title), h('p', {}, c.body)),
        ),
      ),
    ),
    h(
      'section',
      { class: 'stats' },
      ...story.stats.map((s) =>
        h(
          'div',
          { class: 'stat' },
          h('strong', {}, `${s.prefix ?? ''}${s.value}${s.suffix ?? ''}`),
          h('span', {}, s.label),
        ),
      ),
    ),
  );
