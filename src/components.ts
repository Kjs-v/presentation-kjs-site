/** Small building blocks shared by several pages. */
import type { Content, Product } from '../content/content.schema';
import { h } from './lib/dom';
import { openProduct } from './widgets/product-dialog';

type Stat = Content['story']['stats'][number];

export function stats(list: Stat[]): HTMLElement {
  return h(
    'div',
    { class: 'stats' },
    ...list.map((s) =>
      h(
        'div',
        { class: 'stat' },
        h('strong', {}, `${s.prefix ?? ''}${s.value}${s.suffix ?? ''}`),
        h('span', {}, s.label),
      ),
    ),
  );
}

export function cards(list: { title: string; body: string }[]): HTMLElement {
  return h(
    'div',
    { class: 'card-grid' },
    ...list.map((c) => h('article', { class: 'card' }, h('h3', {}, c.title), h('p', {}, c.body))),
  );
}

/** A photo tile with a caption: products, client packs, machines. With onClick it becomes a button. */
export function tile(image: string, name: string, note?: string, onClick?: () => void): HTMLElement {
  const figure = h(
    'figure',
    { class: 'tile' },
    h('div', { class: 'tile-photo' }, h('img', { src: image, alt: name, loading: 'lazy' })),
    h('figcaption', {}, h('strong', {}, name), note ? h('span', {}, note) : null),
  );
  if (!onClick) return figure;
  const button = h('button', { type: 'button', class: 'tile-button', 'aria-label': `Open ${name}` }, figure);
  button.addEventListener('click', onClick);
  return button;
}

/** A product tile. Pass the content to make it open the product pop-up on click. */
export const productTile = (p: Product, content?: Content) =>
  tile(
    p.featuredImage ?? p.image,
    p.name,
    p.description || undefined,
    content ? () => openProduct(p, content) : undefined,
  );

/** Groups items by a key, keeping the first-seen order of groups. */
export function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return [...map];
}

export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
