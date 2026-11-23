import type { Page } from '../lib/router';
import { h } from '../lib/dom';
import { tile } from '../components';

export const galleryPage: Page = ({ gallery }) =>
  h(
    'div',
    { class: 'page-gallery wrap padded' },
    h('h1', {}, 'Gallery'),
    h(
      'figure',
      { class: 'video' },
      h('video', {
        src: gallery.video.src,
        poster: gallery.video.poster,
        controls: true,
        playsinline: true,
        preload: 'metadata',
      }),
      h('figcaption', {}, gallery.video.caption),
    ),
    h('div', { class: 'tile-grid wide' }, ...gallery.photos.map((p) => tile(p.src, p.caption))),
  );
