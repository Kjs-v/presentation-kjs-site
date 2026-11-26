/**
 * Faint ‹ › arrows at the left and right screen edges. They go through the header pages in order
 * (Home, then site.nav), so people can move on without reaching for the header.
 * They stay small and see-through, and grow and sharpen as the mouse comes near.
 * Hidden on the slide deck (it has its own arrows) and at the first / last page.
 */
import type { Site } from '../../content/content.schema';
import { h } from '../lib/dom';

/** How close (px) the mouse must come before an arrow starts to grow. */
const REACH = 240;

export function pageArrows(site: Site) {
  const pages = [{ path: '/', label: site.name }, ...site.nav];
  const make = (side: 'prev' | 'next', glyph: string) =>
    h(
      'a',
      { class: `page-arrow ${side}`, 'data-route': true, href: '/' },
      h('span', { 'aria-hidden': 'true' }, glyph),
    );
  const prev = make('prev', '‹');
  const next = make('next', '›');
  const element = h('div', { class: 'page-arrows' }, prev, next);

  /** Shows the right arrows for the page now on screen. */
  const update = (pathname: string) => {
    const section = '/' + (pathname.split('/')[1] ?? '');
    const i = pages.findIndex((p) => p.path === section);
    element.hidden = i < 0 || pathname === '/show';
    const set = (link: HTMLAnchorElement, page: (typeof pages)[number] | undefined, word: string) => {
      link.hidden = !page;
      if (!page) return;
      link.href = page.path;
      link.setAttribute('aria-label', `${word}: ${page.label}`);
      link.title = page.label;
    };
    set(prev, pages[i - 1], site.menu.pager.previous);
    set(next, pages[i + 1], site.menu.pager.next);
  };

  // Mouse distance → --near (0 far … 1 on top of it). Checked at most once a frame.
  let queued = false;
  let x = -1e4;
  let y = -1e4;
  const measure = () => {
    queued = false;
    for (const link of [prev, next]) {
      if (link.hidden) continue;
      const r = link.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      link.style.setProperty('--near', Math.max(0, 1 - d / REACH).toFixed(3));
    }
  };
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(measure);
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    x = y = -1e4;
    measure();
  });

  return { element, update };
}
