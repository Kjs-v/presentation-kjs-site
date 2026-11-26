/**
 * Unit pages ("/unit-1", "/unit-1/products", ...).
 * A big photo with buttons popping up over it. Each button opens one section below the photo.
 * Which buttons appear (and their order) comes from unit.tabs in content.json.
 */
import type { Page } from '../lib/router';
import type { Certification, Content, Unit, UnitTabId } from '../../content/content.schema';
import { icon } from '../lib/icons';
import { h } from '../lib/dom';
import { byOrder, cards, groupBy, productTile, stats, tile, partnerLogo } from '../components';
import { notFoundPage } from './not-found';
import { supplyChainSection } from './supply-chain';

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
  customers: (unit, { clientPacks, site }) => {
    const list = clientPacks.filter((p) => p.unit === unit.id).sort(byOrder);
    if (!list.length) return empty('No customers added yet.');
    return [
      h('div', { class: 'logos compact' }, ...site.partners.map(partnerLogo)),
      ...groupBy(list, (p) => p.brand).flatMap(([brand, items]) => [
        h('h3', { class: 'group-title' }, brand, h('span', {}, String(items.length))),
        h('div', { class: 'tile-grid' }, ...items.map((p) => tile(p.image, p.name))),
      ]),
    ];
  },
  about: (unit) => [
    h('p', { class: 'lead' }, unit.summary),
    stats(unit.stats),
    cards(unit.highlights),
    unit.mapUrl
      ? h(
          'div',
          { class: 'actions' },
          h(
            'a',
            { class: 'secondary', href: unit.mapUrl, target: '_blank', rel: 'noopener noreferrer' },
            `Find ${unit.title} on Google Maps`,
          ),
        )
      : h('span'),
  ],
  machinery: (unit, { machinery }) => {
    const list = machinery.filter((m) => m.unit === unit.id).sort(byOrder);
    if (!list.length) return empty('No machinery added yet.');
    return [h('div', { class: 'tile-grid wide' }, ...list.map((m) => tile(m.image, m.name, m.description)))];
  },
  'supply-chain': (_unit, content) => [supplyChainSection(content)],
  certifications: (unit, { certifications }) => {
    const list = certifications.filter((c) => c.units.includes(unit.id)).sort(byOrder);
    if (!list.length) return empty('No certifications added yet.');
    return [h('div', { class: 'cert-grid' }, ...list.map(certCard))];
  },
};

function certCard(c: Certification): HTMLElement {
  return h(
    'article',
    { class: 'cert-card' },
    c.image
      ? h('img', { src: c.image, alt: c.name, class: 'cert-image', loading: 'lazy' })
      : h('div', { class: 'cert-image cert-placeholder', 'aria-hidden': 'true' }, icon('award')),
    h(
      'div',
      { class: 'cert-text' },
      h('h3', {}, c.name),
      h('p', { class: 'cert-issuer' }, c.issuer),
      h('p', {}, c.description),
      c.validUntil ? h('p', { class: 'cert-valid' }, `Valid until ${c.validUntil}`) : null,
    ),
  );
}

/** One section of a unit, below the photo. Also used to build the full-profile PDF. */
export function unitPanel(unit: Unit, tab: Unit['tabs'][number], content: Content): HTMLElement {
  return h(
    'section',
    { class: 'unit-panel', id: 'unit-panel' },
    h(
      'div',
      { class: 'wrap' },
      // Supply Chain brings its own heading (content.supplyChain.title).
      tab.id === 'supply-chain' ? null : h('h2', {}, tab.label),
      ...sections[tab.id](unit, content),
    ),
  );
}

export const unitPage: Page = (content, params) => {
  const unit = content.units.find((u) => u.id === params.unitId);
  if (!unit) return notFoundPage(content, params);
  // A tab with a url opens that site instead, so it never shows a section here.
  const active = unit.tabs.find((t) => t.id === params.tab && !t.url);
  if (params.tab && !active) return notFoundPage(content, params);

  const tabs = h(
    'nav',
    { class: 'unit-tabs', 'aria-label': `${unit.title} sections` },
    ...unit.tabs.map((t, i) => {
      const link = h(
        'a',
        {
          ...(t.url
            ? { href: t.url, target: '_blank', rel: 'noopener noreferrer' }
            : { href: `/${unit.id}/${t.id}`, 'data-route': true }),
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
    unit.photoCaption ? h('span', { class: 'photo-caption' }, unit.photoCaption) : null,
    h('div', { class: 'unit-heading' }, h('h1', {}, unit.title), h('p', {}, unit.subtitle)),
    tabs,
  );

  const panel = active ? unitPanel(unit, active, content) : null;

  return h('div', { class: 'page-unit' }, stage, panel);
};
