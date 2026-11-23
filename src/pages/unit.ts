import type { Page } from '../lib/router';
import { h } from '../lib/dom';
import { notFoundPage } from './not-found';

export const unitPage: Page = (content, params) => {
  const unit = content.units.find((u) => u.id === params.unitId);
  if (!unit) return notFoundPage(content, params);
  const made = content.products.filter((p) => p.unit === unit.id).sort((a, b) => a.order - b.order);
  return h(
    'div',
    { class: 'page unit' },
    h('h1', {}, unit.title),
    h('p', { class: 'lead' }, unit.subtitle),
    h('img', { src: unit.photo, alt: unit.title, class: 'unit-photo' }),
    h('p', {}, unit.summary),
    h(
      'section',
      { class: 'stats' },
      ...unit.stats.map((s) =>
        h('div', { class: 'stat' }, h('strong', {}, String(s.value)), h('span', {}, s.label)),
      ),
    ),
    h(
      'div',
      { class: 'card-grid' },
      ...unit.highlights.map((x) =>
        h('article', { class: 'card' }, h('h3', {}, x.title), h('p', {}, x.body)),
      ),
    ),
    made.length ? h('h2', {}, `Made in ${unit.title}`) : null,
    h(
      'div',
      { class: 'product-grid' },
      ...made.map((p) =>
        h(
          'figure',
          { class: 'product' },
          h('img', { src: p.image, alt: p.name, loading: 'lazy' }),
          h('figcaption', {}, p.name),
        ),
      ),
    ),
  );
};
