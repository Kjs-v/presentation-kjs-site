/**
 * Gallery ("/gallery"): videos and photos, with section buttons next to the title.
 * Each button opens one section ("/gallery/machinery", "/gallery/products").
 * Which buttons appear (and their order) comes from gallery.tabs in content.json.
 * An open section has a ✕ button that goes back to "/gallery" without reloading (sections fade in).
 */
import type { Page } from '../lib/router';
import type { Content, GalleryTabId } from '../../content/content.schema';
import { h, routeLink } from '../lib/dom';
import { byOrder, tile } from '../components';
import { productsSection } from './products';
import { notFoundPage } from './not-found';

type Video = { src: string; poster: string; caption: string };

const player = (v: Video, large = false) =>
  h(
    'figure',
    { class: large ? 'video video-large' : 'video' },
    h('video', { src: v.src, poster: v.poster, controls: true, playsinline: true, preload: 'none' }),
    h('figcaption', {}, v.caption),
  );

/** Videos and photos (the page without a section open). */
function media({ gallery }: Content): HTMLElement[] {
  const [first, ...rest] = gallery.videos;
  return [
    ...(first ? [player(first, true)] : []),
    ...(rest.length ? [h('div', { class: 'video-grid' }, ...rest.map((v) => player(v)))] : []),
    h('div', { class: 'tile-grid wide' }, ...gallery.photos.map((p) => tile(p.src, p.caption))),
  ];
}

/** Machinery from every unit, grouped by unit. */
function machinery({ machinery, units }: Content): HTMLElement[] {
  const groups = units
    .map((u) => ({ unit: u, items: machinery.filter((m) => m.unit === u.id).sort(byOrder) }))
    .filter((g) => g.items.length);
  if (!groups.length) return [h('p', { class: 'empty' }, 'No machinery added yet.')];
  return groups.flatMap(({ unit, items }) => [
    h('h2', { class: 'gallery-unit-title' }, unit.title),
    h('div', { class: 'tile-grid wide' }, ...items.map((m) => tile(m.image, m.name, m.description))),
  ]);
}

/** ✕: back to the plain gallery, scrolling up smoothly (the router swaps the content in place). */
function closeButton(label: string): HTMLAnchorElement {
  const link = routeLink('/gallery', '', 'gallery-close');
  link.setAttribute('aria-label', label);
  link.title = label;
  link.append(h('span', { 'aria-hidden': 'true' }, '✕'));
  link.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  return link;
}

/** One renderer per tab id. To add a section, add its id to galleryTabIds in the schema and a renderer here. */
const sections: Record<Exclude<GalleryTabId, 'products'>, (content: Content) => HTMLElement[]> = {
  machinery,
};

export const galleryPage: Page = (content, params) => {
  const { tabs, closeLabel } = content.gallery;
  const open = params.tab ? tabs.find((t) => t.id === params.tab) : undefined;
  if (params.tab && !open) return notFoundPage(content, params);

  const head = h(
    'div',
    { class: 'gallery-head' },
    h('h1', {}, routeLink('/gallery', 'Gallery')),
    h(
      'nav',
      { class: 'gallery-tabs', 'aria-label': 'Gallery sections' },
      ...tabs.map((t) => {
        const link = routeLink(`/gallery/${t.id}`, t.label, 'gallery-tab');
        if (t.id === open?.id) link.setAttribute('aria-current', 'page');
        return link;
      }),
      open ? closeButton(`${closeLabel} ${open.label}`) : null,
    ),
  );

  // Products is a full-width section of its own, so it sits below the padded title area.
  if (open?.id === 'products')
    return h(
      'div',
      { class: 'page-gallery' },
      h('div', { class: 'wrap padded gallery-top' }, head),
      h('div', { class: 'gallery-body' }, productsSection(content)),
    );

  const body = open ? sections[open.id](content) : media(content);
  return h('div', { class: 'page-gallery wrap padded' }, head, h('div', { class: 'gallery-body' }, ...body));
};
