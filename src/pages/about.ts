/** About ("/about"): company hero, brand partners, key numbers and the story timeline. */
import type { Page } from '../lib/router';
import { h, routeLink } from '../lib/dom';
import { stats } from '../components';

export const aboutPage: Page = ({ about, story }) =>
  h(
    'div',
    { class: 'page-about' },
    h(
      'section',
      { class: 'about-hero' },
      h(
        'div',
        { class: 'wrap about-hero-layout' },
        h(
          'div',
          {},
          h('p', { class: 'eyebrow' }, about.eyebrow),
          h('h1', {}, about.title, h('em', {}, about.titleEmphasis)),
          h('p', { class: 'lead' }, about.subtitle),
          h(
            'div',
            { class: 'actions' },
            ...about.buttons.map((b) => routeLink(b.path, b.label, `${b.style} cta`)),
          ),
        ),
        h(
          'figure',
          { class: 'about-photo' },
          h('img', { src: about.image, alt: about.imageCaption }),
          h('figcaption', {}, about.imageCaption),
        ),
      ),
    ),
    h(
      'section',
      { class: 'light-section partners' },
      h(
        'div',
        { class: 'wrap' },
        h('h2', {}, about.partnersTitle),
        h(
          'div',
          { class: 'logos' },
          ...about.partners.map((p) => h('div', {}, h('img', { src: p.logo, alt: p.name, loading: 'lazy' }))),
        ),
      ),
    ),
    h(
      'section',
      { class: 'dark-section' },
      h(
        'div',
        { class: 'wrap' },
        stats(story.stats),
        h('h2', {}, about.storyTitle),
        h(
          'ol',
          { class: 'timeline' },
          ...story.timeline.map((t) =>
            h(
              'li',
              {},
              h('span', { class: 'timeline-tag' }, t.subtitle),
              h('h3', {}, t.title),
              h('p', {}, t.body),
            ),
          ),
        ),
      ),
    ),
  );
