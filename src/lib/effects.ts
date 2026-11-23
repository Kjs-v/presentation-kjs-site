/** Site-wide motion from the design reference: sparkle trail, click glints, hide-on-scroll header, intro loader. */
import { h } from './dom';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function glint(x: number, y: number, cls: string): void {
  if (reduced.matches) return;
  const particle = h('i', { class: cls, 'aria-hidden': 'true' }, '✦');
  particle.style.left = x + 'px';
  particle.style.top = y + 'px';
  document.body.append(particle);
  setTimeout(() => particle.remove(), 650);
}

export function initEffects(): void {
  let lastTrail = 0;
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || performance.now() - lastTrail < 72) return;
      lastTrail = performance.now();
      glint(e.clientX - 8, e.clientY + 8, 'fx-trace');
    },
    { passive: true },
  );
  document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest?.('button,a');
    if (e.detail && target?.matches('.primary,.cta,.unit-tab')) glint(e.clientX, e.clientY, 'fx-glint');
  });

  let lastScroll = scrollY;
  window.addEventListener(
    'scroll',
    () => {
      const now = scrollY;
      if (Math.abs(now - lastScroll) < 8) return;
      const hide = now > 120 && now > lastScroll && !document.body.classList.contains('mobile-open');
      document.body.classList.toggle('nav-hidden', hide);
      lastScroll = now;
    },
    { passive: true },
  );
}

/** Called after every route change. */
export function afterRoute(): void {
  document.body.classList.remove('nav-hidden', 'mobile-open');
  const menu = document.getElementById('mobile-menu');
  if (menu) {
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = 'Menu';
  }
}

/** Short loading screen, shown once per browser session. */
export function introScreen(): void {
  try {
    if (sessionStorage.getItem('kjs-intro')) return;
    sessionStorage.setItem('kjs-intro', 'seen');
  } catch {
    /* storage blocked: just show it */
  }
  if (reduced.matches) return;

  const meter = h('progress', { value: 0, max: 100, 'aria-label': 'Loading progress' });
  const label = h('output', { 'aria-hidden': 'true' }, '0%');
  const skip = h('button', { type: 'button', class: 'secondary' }, 'Skip intro');
  const overlay = h(
    'div',
    { class: 'intro', 'aria-label': 'Presentation loading' },
    h('div', { class: 'intro-meter' }, meter, label, skip),
  );
  document.body.append(overlay);

  const start = performance.now();
  let finished = false;
  const close = () => {
    if (finished) return;
    finished = true;
    overlay.classList.add('intro-done');
    setTimeout(() => overlay.remove(), 300);
  };
  skip.addEventListener('click', close, { once: true });
  const advance = (now: number) => {
    if (finished) return;
    const progress = Math.min(100, Math.round((now - start) / 7));
    meter.value = progress;
    label.textContent = progress + '%';
    if (progress < 100) requestAnimationFrame(advance);
    else close();
  };
  requestAnimationFrame(advance);
}
