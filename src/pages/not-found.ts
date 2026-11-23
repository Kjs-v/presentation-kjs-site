import type { Page } from '../lib/router';
import { h, routeLink } from '../lib/dom';

export const notFoundPage: Page = () =>
  h(
    'div',
    { class: 'page' },
    h('h1', {}, 'Page not found'),
    routeLink('/', 'Back to home', 'btn btn-primary'),
  );
