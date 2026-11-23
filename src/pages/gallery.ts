import type { Page } from '../lib/router';
import { h } from '../lib/dom';
import { tile } from '../components';

type Video = { src: string; poster: string; caption: string };

const player = (v: Video, large = false) =>
  h(
    'figure',
    { class: large ? 'video video-large' : 'video' },
    h('video', { src: v.src, poster: v.poster, controls: true, playsinline: true, preload: 'none' }),
    h('figcaption', {}, v.caption),
  );

export const galleryPage: Page = ({ gallery }) => {
  const [first, ...rest] = gallery.videos;
  return h(
    'div',
    { class: 'page-gallery wrap padded' },
    h('h1', {}, 'Gallery'),
    first ? player(first, true) : null,
    rest.length ? h('div', { class: 'video-grid' }, ...rest.map((v) => player(v))) : null,
    h('div', { class: 'tile-grid wide' }, ...gallery.photos.map((p) => tile(p.src, p.caption))),
  );
};
