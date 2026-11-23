import type { Page } from '../lib/router';
import type { Product } from '../../content/content.schema';
import { h } from '../lib/dom';

const card = (p: Product) =>
  h(
    'figure',
    { class: 'product' },
    h('img', { src: p.featuredImage ?? p.image, alt: p.name, loading: 'lazy' }),
    h('figcaption', {}, p.name),
  );

export const productsPage: Page = ({ products }) => {
  const sorted = [...products].sort((a, b) => a.order - b.order);
  const groups = [...new Set(sorted.map((p) => p.group))];
  return h(
    'div',
    { class: 'page products' },
    h('h1', {}, 'Products'),
    h('h2', {}, 'Best sellers'),
    h('div', { class: 'product-grid featured' }, ...sorted.filter((p) => p.featured).map(card)),
    ...groups.flatMap((g) => [
      h('h2', {}, g),
      h('div', { class: 'product-grid' }, ...sorted.filter((p) => p.group === g).map(card)),
    ]),
  );
};
