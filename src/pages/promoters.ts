/**
 * Promoter Profile ("/promoter-profile"): the people behind the company.
 * Everything comes from content.promoters. Without a photo, a person's initials are shown instead.
 */
import type { Page } from '../lib/router';
import type { Content } from '../../content/content.schema';
import { h } from '../lib/dom';

type Person = Content['promoters']['people'][number];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function personCard(p: Person): HTMLElement {
  return h(
    'article',
    { class: 'promoter-card' },
    p.photo
      ? h('img', { src: p.photo, alt: p.name, class: 'promoter-photo' })
      : h('div', { class: 'promoter-photo promoter-initials', 'aria-hidden': 'true' }, initials(p.name)),
    h(
      'div',
      { class: 'promoter-text' },
      h('h2', {}, p.name),
      h('p', { class: 'promoter-role' }, p.role),
      h('p', {}, p.bio),
      p.highlights.length
        ? h('ul', { class: 'promoter-points' }, ...p.highlights.map((x) => h('li', {}, x)))
        : null,
    ),
  );
}

export const promotersPage: Page = ({ promoters }) =>
  h(
    'div',
    { class: 'page-promoters wrap padded' },
    h('p', { class: 'eyebrow' }, promoters.eyebrow),
    h('h1', {}, promoters.title),
    h('p', { class: 'lead' }, promoters.intro),
    h('div', { class: 'promoter-list' }, ...promoters.people.map(personCard)),
  );
