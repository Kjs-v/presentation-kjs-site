import type { Page } from '../lib/router';
import { h, routeLink } from '../lib/dom';

export const notFoundPage: Page = () =>
  h(
    'div',
    { class: 'wrap padded' },
    h('h1', {}, 'Page not found'),
    h('div', { class: 'actions' }, routeLink('/', 'Back to home', 'primary')),
  );
