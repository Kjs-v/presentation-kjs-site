import type { Page } from '../lib/router';
import { h } from '../lib/dom';

export const galleryPage: Page = ({ gallery }) =>
  h(
    'div',
    { class: 'page gallery' },
    h('h1', {}, 'Gallery'),
    h(
      'figure',
      { class: 'video' },
      h('video', { src: gallery.video.src, poster: gallery.video.poster, controls: true, playsinline: true }),
      h('figcaption', {}, gallery.video.caption),
    ),
    h(
      'div',
      { class: 'photo-grid' },
      ...gallery.photos.map((p) =>
        h(
          'figure',
          {},
          h('img', { src: p.src, alt: p.caption, loading: 'lazy' }),
          h('figcaption', {}, p.caption),
        ),
      ),
    ),
  );
