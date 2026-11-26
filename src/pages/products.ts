/**
 * Products, shown in the Gallery's Products tab ("/gallery/products").
 * 1. Hero (~75% of the screen): best sellers (featured: true) slowly orbiting. Hover pauses, click opens the product.
 * 2. Catalogue, as in the design reference: group filters, a large "selected product" panel, then every product card.
 */
import type { Content, Product } from '../../content/content.schema';
import { h } from '../lib/dom';
import { byOrder } from '../components';
import { orbit } from '../widgets/orbit';
import { openProduct, productSpecs } from '../widgets/product-dialog';

function catalog(content: Content): HTMLElement {
  const { productsPage: copy } = content;
  const products = [...content.products].sort(byOrder);
  let selected: Product = products[0];
  let group = copy.allLabel;

  const filters = h('div', { class: 'catalog-filters', role: 'group', 'aria-label': 'Filter by group' });
  const photo = h('div', { class: 'product-photo' });
  const profile = h('div', { class: 'product-profile' });
  const stage = h('div', { class: 'catalog-stage' }, photo, profile);
  const list = h('div', { class: 'catalog-list' });

  const drawStage = () => {
    photo.replaceChildren(h('img', { src: selected.featuredImage ?? selected.image, alt: selected.name }));
    const view = h('button', { type: 'button', class: 'secondary' }, copy.viewLabel);
    view.addEventListener('click', () => openProduct(selected, content));
    const name = h('h2', { tabindex: '-1' }, selected.name);
    profile.replaceChildren(
      h('p', { class: 'eyebrow' }, selected.group),
      name,
      ...(selected.description ? [h('p', {}, selected.description)] : []),
      productSpecs(selected, content),
      view,
    );
  };

  const drawList = () => {
    const shown = group === copy.allLabel ? products : products.filter((p) => p.group === group);
    list.replaceChildren(
      ...shown.map((p) => {
        const pick = h(
          'button',
          { type: 'button', class: 'catalog-pick', 'aria-current': p === selected ? 'true' : undefined },
          h('img', { src: p.featuredImage ?? p.image, alt: '', loading: 'lazy' }),
          h('span', {}, p.name),
        );
        pick.addEventListener('click', () => {
          selected = p;
          drawStage();
          list.querySelectorAll('.catalog-pick').forEach((b) => b.removeAttribute('aria-current'));
          pick.setAttribute('aria-current', 'true');
          stage.scrollIntoView({ block: 'start', behavior: 'smooth' });
          profile.querySelector('h2')?.focus({ preventScroll: true });
        });
        const view = h(
          'button',
          { type: 'button', class: 'secondary view-product', 'aria-label': `${copy.viewLabel}: ${p.name}` },
          copy.viewLabel,
        );
        view.addEventListener('click', () => openProduct(p, content));
        return h('article', { class: 'catalog-card' }, pick, view);
      }),
    );
  };

  const groups = [copy.allLabel, ...new Set(products.map((p) => p.group))];
  for (const g of groups) {
    const count = g === copy.allLabel ? products.length : products.filter((p) => p.group === g).length;
    const button = h(
      'button',
      { type: 'button', class: 'secondary', 'aria-pressed': String(g === group) },
      g,
      h('span', { class: 'count' }, String(count)),
    );
    button.addEventListener('click', () => {
      group = g;
      filters.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      // The large panel always shows the first product of the list below.
      selected = g === copy.allLabel ? products[0] : products.find((p) => p.group === g)!;
      drawStage();
      drawList();
    });
    filters.append(button);
  }

  drawStage();
  drawList();
  return h('section', { class: 'catalog wrap' }, h('h2', {}, copy.catalogTitle), filters, stage, list);
}

export function productsSection(content: Content): HTMLElement {
  const { productsPage: copy } = content;
  const featured = content.products.filter((p) => p.featured).sort(byOrder);
  const byId = new Map(content.products.map((p) => [p.id, p]));

  const hero = h(
    'section',
    { class: 'products-hero' },
    h(
      'div',
      { class: 'products-hero-copy' },
      h('p', { class: 'eyebrow' }, copy.eyebrow),
      h('h2', { class: 'products-hero-title' }, copy.title),
      h('p', { class: 'products-hero-summary' }, copy.summary),
    ),
    orbit(
      featured.map((p) => ({ id: p.id, name: p.name, image: p.featuredImage ?? p.image })),
      { rotationSeconds: copy.rotationSeconds, onPick: (id) => openProduct(byId.get(id)!, content) },
    ),
  );

  return h('div', { class: 'page-products' }, hero, catalog(content));
}
