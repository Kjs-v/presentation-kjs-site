/**
 * Home ("/"): "Trusted by global leaders" with client logos and buttons, a circle of packs that
 * keeps turning (front half only), then the key figures. All text and images come
 * from content.home.
 */
import type { Page } from '../lib/router';
import type { Content } from '../../content/content.schema';
import { h, buttonLink } from '../lib/dom';

type Pack = Content['home']['packs'][number];

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => motionQuery.matches;

/** One full turn of the circle takes this long (ms). */
const TURN_MS = 37500;
/** Packs further than this many places from the front fade out, so only the front half shows. */
const VISIBLE = 3.2;

/**
 * The turning circle of packs. Hovering pauses it; the arrows move it one pack left or right.
 * The front pack is the biggest, the next ones shrink step by step, then the rest stay small.
 */
function packCarousel(packs: Pack[]): HTMLElement {
  const ring = h('div', { class: 'pack-ring' });
  const stage = h('div', { class: 'pack-stage' }, h('div', { class: 'pack-floor' }), ring);
  const items = packs.map((p) => {
    const item = h(
      'div',
      { class: 'pack-item' },
      h('img', { src: p.image, alt: `${p.name} (${p.brand})`, loading: 'eager', decoding: 'async' }),
    );
    ring.append(item);
    return item;
  });
  const prev = h('button', { type: 'button', class: 'pack-spin prev', 'aria-label': 'Turn left' }, '‹');
  const next = h('button', { type: 'button', class: 'pack-spin next', 'aria-label': 'Turn right' }, '›');
  const root = h('div', { class: 'pack-carousel', 'aria-label': 'Packs we make' }, stage, prev, next);

  const n = packs.length;
  const slotMs = TURN_MS / n;
  let pos = 0;
  let target: number | null = null;
  let paused = false;
  let last = 0;
  let width = 0;
  let height = 0;

  // Pause only for a mouse: on touch screens a tap would leave it paused for good.
  root.addEventListener('pointerenter', (e) => (paused = e.pointerType === 'mouse'));
  root.addEventListener('pointerleave', () => (paused = false));
  prev.addEventListener('click', () => (target = (target ?? Math.round(pos)) - 1));
  next.addEventListener('click', () => (target = (target ?? Math.round(pos)) + 1));

  const measure = () => {
    width = stage.clientWidth;
    height = stage.clientHeight;
  };
  const sizes = new ResizeObserver(measure);
  sizes.observe(stage);

  /** Places from the front, between -n/2 and n/2. */
  const fromFront = (v: number) => {
    const d = ((v % n) + n) % n;
    return d > n / 2 ? d - n : d;
  };
  /** Front pack biggest; smaller for each place away, then all the same size after `steps`. */
  const sizeFor = (d: number, max = 1.35, min = 0.7, steps = 2.5) =>
    max - ((max - min) * Math.min(Math.abs(d), steps)) / steps;

  const frame = (now: number) => {
    if (!root.isConnected && last) {
      sizes.disconnect(); // page changed: stop
      return;
    }
    const dt = last ? Math.min(now - last, 100) : 0;
    last = now;
    if (target !== null) {
      pos += (target - pos) * Math.min(1, dt / 140);
      if (Math.abs(target - pos) < 0.003) {
        pos = target;
        target = null;
      }
    } else if (!paused && !reducedMotion()) pos += dt / slotMs;

    const rx = width * 0.4;
    const ry = height * 0.16;
    items.forEach((item, i) => {
      const a = ((i + pos) / n) * Math.PI * 2;
      const d = Math.abs(fromFront(i + pos));
      const depth = Math.cos(a); // 1 = front, -1 = back
      item.style.transform = `translate3d(${Math.sin(a) * rx}px, ${depth * ry}px, 0) scale(${sizeFor(d)})`;
      item.style.opacity = String(d <= 2.4 ? 1 - d * 0.08 : Math.max(0, (VISIBLE - d) / 0.8) * 0.8);
      item.style.visibility = d > VISIBLE ? 'hidden' : 'visible';
      item.style.zIndex = String(Math.round((depth + 1) * 100));
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return root;
}

/** Key figures with outlined numbers; numbers count up once when the page opens. */
function figures(stats: Content['home']['stats']): HTMLElement {
  const section = h(
    'section',
    { class: 'home-stats', 'aria-label': 'Key figures' },
    h(
      'div',
      { class: 'wrap home-stats-grid' },
      ...stats.map((s) => {
        const num = h('span', {}, String(s.value));
        const box = h(
          'div',
          { class: 'home-stat' },
          h('h2', {}, s.label),
          h(
            'p',
            { class: 'home-stat-num' },
            s.prefix ? h('b', {}, s.prefix) : null,
            num,
            s.suffix ? h('b', {}, s.suffix) : null,
          ),
        );
        if (typeof s.value === 'number' && !reducedMotion()) {
          const to = s.value;
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min((now - start) / 1400, 1);
            num.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
        return box;
      }),
    ),
  );
  return section;
}

export const homePage: Page = ({ home }) =>
  h(
    'div',
    { class: 'page-home' },
    h(
      'section',
      { class: 'home-hero' },
      h(
        'div',
        { class: 'wrap home-hero-grid' },
        h(
          'div',
          { class: 'home-copy' },
          h('h1', {}, home.title),
          h(
            'ul',
            { class: 'client-logos', 'aria-label': 'Our clients' },
            ...home.clients.map((c, i) => {
              const li = h('li', {}, h('img', { src: c.logo, alt: c.name }));
              li.style.setProperty('--i', String(i));
              return li;
            }),
          ),
          h('p', { class: 'home-summary' }, home.summary),
          h('div', { class: 'actions' }, ...home.buttons.map((b) => buttonLink(b))),
        ),
        packCarousel(home.packs),
      ),
    ),
    figures(home.stats),
  );
