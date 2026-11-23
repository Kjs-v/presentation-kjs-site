/** Full-screen slide deck. ← / → (or a clicker) move between slides, F toggles full screen. */
import type { Page } from '../lib/router';
import type { Content, Slide } from '../../content/content.schema';
import { h } from '../lib/dom';

function renderSlide(slide: Slide, content: Content): HTMLElement {
  const head = [h('h2', {}, slide.title), slide.summary ? h('p', { class: 'lead' }, slide.summary) : null];
  switch (slide.kind) {
    case 'cover':
      return h('section', { class: 'slide slide-cover' }, h('img', { src: slide.image, alt: '' }), ...head);
    case 'facts':
      return h(
        'section',
        { class: 'slide' },
        ...head,
        h(
          'div',
          { class: 'card-grid' },
          ...slide.items.map((i) =>
            h('article', { class: 'card' }, h('h3', {}, i.title), h('p', {}, i.body)),
          ),
        ),
      );
    case 'logos':
      return h(
        'section',
        { class: 'slide' },
        ...head,
        h(
          'div',
          { class: 'logo-row' },
          ...content.home.partners.map((p) => h('img', { src: p.logo, alt: p.name })),
        ),
      );
    case 'products': {
      const picked = slide.productIds.map((id) => content.products.find((p) => p.id === id)!);
      return h(
        'section',
        { class: 'slide' },
        ...head,
        h(
          'div',
          { class: 'product-grid' },
          ...picked.map((p) =>
            h(
              'figure',
              { class: 'product' },
              h('img', { src: p.featuredImage ?? p.image, alt: p.name }),
              h('figcaption', {}, p.name),
            ),
          ),
        ),
      );
    }
  }
}

let onKey: ((e: KeyboardEvent) => void) | undefined;

export const showPage: Page = (content) => {
  const slides = content.slides.map((s) => renderSlide(s, content));
  const counter = h('span', { class: 'slide-counter' });
  let index = 0;
  const go = (to: number) => {
    index = Math.max(0, Math.min(slides.length - 1, to));
    slides.forEach((s, i) => (s.hidden = i !== index));
    counter.textContent = `${index + 1} / ${slides.length}`;
  };

  if (onKey) document.removeEventListener('keydown', onKey);
  onKey = (e) => {
    if (!document.querySelector('.deck')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) (e.preventDefault(), go(index + 1));
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) (e.preventDefault(), go(index - 1));
    else if (e.key.toLowerCase() === 'f')
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  };
  document.addEventListener('keydown', onKey);

  const deck = h('div', { class: 'page deck' }, ...slides, counter);
  go(0);
  return deck;
};
