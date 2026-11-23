/** Home ("/"): the design reference's landing page. Full-screen photo, animated company name, then "What we do". */
import type { Page } from '../lib/router';
import { h, routeLink } from '../lib/dom';

/** Splits the title into letters so each one can animate in (screen readers get the plain title). */
function animatedTitle(text: string): HTMLElement {
  const heading = h('h1', { 'aria-label': text });
  let index = 0;
  for (const word of text.split(' ')) {
    const token = h('span', { class: 'hero-word', 'aria-hidden': 'true' });
    for (const letter of word) {
      const part = h('span', {}, letter);
      part.style.setProperty('--letter', String(index++));
      token.append(part);
    }
    heading.append(token, ' ');
  }
  return heading;
}

export const homePage: Page = ({ home }) =>
  h(
    'div',
    { class: 'page-home' },
    h(
      'section',
      { class: 'landing' },
      h('img', { src: home.image, alt: '', class: 'landing-photo', fetchpriority: 'high' }),
      h(
        'div',
        { class: 'landing-copy' },
        h('p', { class: 'eyebrow' }, home.eyebrow),
        animatedTitle(home.title),
        h('p', { class: 'landing-summary' }, home.summary),
        h(
          'div',
          { class: 'actions' },
          ...home.buttons.map((b) => routeLink(b.path, b.label, `${b.style} cta`)),
        ),
      ),
      h('span', { class: 'landing-caption' }, home.imageCaption),
    ),
    h(
      'section',
      { class: 'light-section' },
      h(
        'div',
        { class: 'wrap' },
        h('h2', {}, home.capabilitiesTitle),
        h(
          'div',
          { class: 'capability-list' },
          ...home.capabilities.map((c) =>
            h(
              'article',
              {},
              h('h3', {}, c.title),
              h('p', {}, c.body),
              c.link
                ? h('a', { href: c.link.url, target: '_blank', rel: 'noopener noreferrer' }, c.link.label)
                : null,
            ),
          ),
        ),
      ),
    ),
  );
