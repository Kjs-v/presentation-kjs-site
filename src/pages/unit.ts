/**
 * Unit pages ("/unit-1", "/unit-1/products", ...).
 * A big photo with buttons popping up over it. Each button opens one section below the photo.
 * Which buttons appear (and their order) comes from unit.tabs in content.json.
 */
import type { Page } from '../lib/router';
import type { Content, Unit, UnitTabId } from '../../content/content.schema';
import { h } from '../lib/dom';
import { byOrder, cards, groupBy, productTile, stats, tile } from '../components';
import { notFoundPage } from './not-found';

type Section = (unit: Unit, content: Content) => HTMLElement[];

const empty = (text: string) => [h('p', { class: 'empty' }, text)];

/** One renderer per tab id. To add a new kind of section, add its id to unitTabIds in the schema and a renderer here. */
const sections: Record<UnitTabId, Section> = {
  products: (unit, content) => {
    const { products } = content;
    const list = products.filter((p) => p.unit === unit.id).sort(byOrder);
    if (!list.length) return empty('No products added yet.');
    return groupBy(list, (p) => p.group).flatMap(([group, items]) => [
      h('h3', { class: 'group-title' }, group, h('span', {}, String(items.length))),
      h('div', { class: 'tile-grid' }, ...items.map((p) => productTile(p, content))),
    ]);
  },
  clients: (unit, { clientPacks, about }) => {
    const list = clientPacks.filter((p) => p.unit === unit.id).sort(byOrder);
    if (!list.length) return empty('No clients added yet.');
    return [
      h(
        'div',
        { class: 'logos compact' },
        ...about.partners.map((p) => h('div', {}, h('img', { src: p.logo, alt: p.name, loading: 'lazy' }))),
      ),
      ...groupBy(list, (p) => p.brand).flatMap(([brand, items]) => [
        h('h3', { class: 'group-title' }, brand, h('span', {}, String(items.length))),
        h('div', { class: 'tile-grid' }, ...items.map((p) => tile(p.image, p.name))),
      ]),
    ];
  },
  about: (unit) => [h('p', { class: 'lead' }, unit.summary), stats(unit.stats), cards(unit.highlights)],
  machinery: (unit, { machinery }) => {
    const list = machinery.filter((m) => m.unit === unit.id).sort(byOrder);
    if (!list.length) return empty('No machinery added yet.');
    return [h('div', { class: 'tile-grid wide' }, ...list.map((m) => tile(m.image, m.name, m.description)))];
  },
};

export const unitPage: Page = (content, params) => {
  const unit = content.units.find((u) => u.id === params.unitId);
  if (!unit) return notFoundPage(content, params);
  const active = unit.tabs.find((t) => t.id === params.tab);
  if (params.tab && !active) return notFoundPage(content, params);

  const tabs = h(
    'nav',
    { class: 'unit-tabs', 'aria-label': `${unit.title} sections` },
    ...unit.tabs.map((t, i) => {
      const link = h(
        'a',
        {
          href: `/${unit.id}/${t.id}`,
          'data-route': true,
          class: 'unit-tab',
          'aria-current': t.id === active?.id ? 'page' : undefined,
        },
        t.label,
      );
      link.style.setProperty('--i', String(i));
      return link;
    }),
  );

  const stage = h(
    'section',
    { class: `unit-stage${active ? ' has-tab' : ''}` },
    h('img', { src: unit.photo, alt: `${unit.title} building`, class: 'unit-photo' }),
    h('div', { class: 'unit-heading' }, h('h1', {}, unit.title), h('p', {}, unit.subtitle)),
    tabs,
  );

  const panel = active
    ? h(
        'section',
        { class: 'unit-panel', id: 'unit-panel' },
        h('div', { class: 'wrap' }, h('h2', {}, active.label), ...sections[active.id](unit, content)),
      )
    : null;

  return h('div', { class: 'page-unit' }, stage, panel);
};
