/** All products ("/products"), opened from the home page button. */
import type { Page } from '../lib/router';
import { h } from '../lib/dom';
import { byOrder, groupBy, productTile } from '../components';

export const productsPage: Page = ({ products }) => {
  const sorted = [...products].sort(byOrder);
  return h(
    'div',
    { class: 'page-products wrap padded' },
    h('h1', {}, 'Products'),
    h('h3', { class: 'group-title' }, 'Best sellers'),
    h('div', { class: 'tile-grid' }, ...sorted.filter((p) => p.featured).map(productTile)),
    ...groupBy(sorted, (p) => p.group).flatMap(([group, items]) => [
      h('h3', { class: 'group-title' }, group, h('span', {}, String(items.length))),
      h('div', { class: 'tile-grid' }, ...items.map(productTile)),
    ]),
  );
};
