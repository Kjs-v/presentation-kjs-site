/**
 * Marico pitch ("/marico", header link "Marico").
 * 1. A PIN screen. The PIN itself is not stored anywhere: content.marico.lock.pinHash holds its SHA-256,
 *    and the typed digits are hashed and compared. Unlocking is remembered until the browser tab is closed.
 *    This keeps casual visitors out; it is not strong security (the page code is public).
 * 2. The film (src/pages/marico-film.ts): scenes play one after another like a video, with a caption bar,
 *    a progress bar, and controls. → / PageDown (or a clicker) = next, ← / PageUp = back, Space = pause,
 *    F = full screen, Home = start again.
 * 3. Download PDF / PowerPoint: one page or slide per scene (src/widgets/marico-export.ts).
 */
import type { Content, FilmScene } from '../../content/content.schema';
import type { Page } from '../lib/router';
import { h } from '../lib/dom';
import { orbit } from '../widgets/orbit';
import { openProduct } from '../widgets/product-dialog';

const UNLOCK_KEY = 'kjs-marico-unlocked';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isUnlocked(hash: string): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === hash;
  } catch {
    return false;
  }
}

function lockScreen(content: Content, onUnlock: () => void): HTMLElement {
  const { lock } = content.marico;
  const error = h('p', { class: 'mlock-error', role: 'alert' });
  const boxes = Array.from({ length: lock.pinLength }, (_, i) =>
    h('input', {
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      maxlength: 1,
      'aria-label': `Digit ${i + 1}`,
      class: 'mlock-digit',
    }),
  );
  const pin = h('div', { class: 'mlock-pin' }, ...boxes);
  const card = h(
    'div',
    { class: 'mlock-card' },
    h('img', { src: content.site.logoOnLight, alt: content.site.name, class: 'mlock-logo' }),
    h('h1', {}, lock.title),
    h('p', {}, lock.text),
    pin,
    error,
  );

  const check = async () => {
    const code = boxes.map((b) => b.value).join('');
    if (code.length < lock.pinLength) return;
    boxes.forEach((b) => (b.disabled = true));
    if ((await sha256(code)) === lock.pinHash) {
      pin.classList.add('ok');
      try {
        sessionStorage.setItem(UNLOCK_KEY, lock.pinHash);
      } catch {
        /* private mode: unlock for this visit only */
      }
      setTimeout(onUnlock, 300);
      return;
    }
    pin.classList.add('bad');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    error.textContent = lock.error;
    setTimeout(() => {
      pin.classList.remove('bad');
      boxes.forEach((b) => ((b.disabled = false), (b.value = '')));
      boxes[0].focus();
    }, 500);
  };

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      error.textContent = '';
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      void check();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, boxes.length);
      if (!digits) return;
      e.preventDefault();
      boxes.forEach((b, j) => (b.value = digits[j] ?? ''));
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
      void check();
    });
  });
  requestAnimationFrame(() => boxes[0].focus());
  return h('section', { class: 'mlock' }, card);
}

function player(content: Content): HTMLElement {
  const m = content.marico;
  const L = m.labels;
  const scenes = m.scenes;

  const canvas = h('canvas', { role: 'img', 'aria-label': L.stage });
  const segs = h('div', { class: 'film-segs' });
  const segFill = scenes.map((s, i) => {
    const fill = h('i');
    const b = h('button', { type: 'button', 'aria-label': `${L.scene} ${i + 1}: ${s.rail}` }, fill);
    b.addEventListener('click', () => go(i));
    segs.append(b);
    return fill;
  });
  const productsScene = scenes.find((s) => s.kind === 'products');
  const byId = new Map(content.products.map((p) => [p.id, p]));
  const productsLayer = h('div', { class: 'film-products', 'aria-hidden': 'true' });
  if (productsScene?.kind === 'products') {
    const featured = content.products
      .filter((p) => p.featured)
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ id: p.id, name: p.name, image: p.featuredImage ?? p.image }));
    productsLayer.append(
      orbit(featured, {
        rotationSeconds: productsScene.rotationSeconds,
        onPick: (id) => openProduct(byId.get(id)!, content),
      }),
    );
  }
  const screen = h(
    'div',
    { class: 'film-screen' },
    canvas,
    productsLayer,
    segs,
    h('div', { class: 'film-brand' }, content.site.name),
  );

  const capEye = h('p', { class: 'film-cap-eye' });
  const capTitle = h('h2');
  const capLine = h('p', { class: 'film-cap-line' });
  const capStats = h('div', { class: 'film-cap-stats' });
  const cap = h(
    'div',
    { class: 'film-cap', 'aria-live': 'polite', hidden: true },
    capEye,
    capTitle,
    capLine,
    capStats,
  );
  const stage = h('div', { class: 'film-stage' }, screen, cap);

  const btn = (label: string, cls = '') => h('button', { type: 'button', class: `film-btn ${cls}` }, label);
  const backBtn = btn(L.back);
  const playBtn = btn(L.pause, 'primary');
  const nextBtn = btn(L.next);
  const restartBtn = btn(L.restart);
  const fullBtn = btn(L.fullScreen);
  const auto = h('input', { type: 'checkbox', checked: true });
  const now = h('span', { class: 'film-now' });
  const pdfBtn = btn(L.downloadPdf, 'download');
  const pptBtn = btn(L.downloadPpt, 'download');
  const bar = h(
    'div',
    { class: 'film-bar' },
    backBtn,
    playBtn,
    nextBtn,
    restartBtn,
    fullBtn,
    h('label', { class: 'film-auto' }, auto, ` ${L.autoAdvance}`),
    now,
    h('span', { class: 'film-downloads' }, pdfBtn, pptBtn),
  );
  const root = h('div', { class: 'film' }, stage, bar);

  /* ---------- Playback state ---------- */
  let cur = 0,
    st = 0,
    prev = -1,
    prevSt = 0,
    fade = 1,
    playing = true,
    T = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const caption = () => {
    const s: FilmScene = scenes[cur];
    productsLayer.classList.toggle('on', s.kind === 'products');
    if (s.kind === 'title' || !s.title) {
      cap.hidden = true;
      return;
    }
    cap.hidden = false;
    cap.classList.remove('in');
    capEye.textContent = s.eyebrow ?? '';
    capTitle.textContent = s.title;
    capLine.textContent = s.line ?? '';
    capStats.replaceChildren(
      ...(s.stats ?? []).map((x) => h('div', {}, h('strong', {}, x.value), h('span', {}, x.label))),
    );
    void cap.offsetWidth;
    cap.classList.add('in');
  };
  const setPlay = () => (playBtn.textContent = playing ? L.pause : L.play);
  function go(i: number) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    if (i === cur) return;
    prev = cur;
    prevSt = st;
    fade = 0;
    cur = i;
    st = 0;
    caption();
  }
  const restart = () => {
    playing = true;
    setPlay();
    if (cur === 0) st = 0;
    else go(0);
  };

  backBtn.addEventListener('click', () => go(cur - 1));
  nextBtn.addEventListener('click', () => go(cur + 1));
  restartBtn.addEventListener('click', restart);
  playBtn.addEventListener('click', () => {
    if (!playing && cur === scenes.length - 1 && st >= scenes[cur].seconds) return restart();
    playing = !playing;
    setPlay();
  });
  const full = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else stage.requestFullscreen?.().catch(() => {});
  };
  fullBtn.addEventListener('click', full);
  const onFullChange = () =>
    (fullBtn.textContent = document.fullscreenElement === stage ? L.exitFullScreen : L.fullScreen);
  document.addEventListener('fullscreenchange', onFullChange);

  // Keys are caught before the site's own handlers (F would otherwise make the whole page full screen).
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) return cleanup();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], dialog'))
      return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown') go(cur + 1);
    else if (k === 'ArrowLeft' || k === 'PageUp') go(cur - 1);
    else if (k === ' ' && !target?.closest('button')) playBtn.click();
    else if ((k === 'f' || k === 'F') && !e.repeat) full();
    else if (k === 'Home') restart();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  const cleanup = () => {
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFullChange);
  };

  /* ---------- Downloads ---------- */
  const download = async (button: HTMLButtonElement, format: 'pdf' | 'pptx') => {
    const label = button.textContent ?? '';
    pdfBtn.disabled = pptBtn.disabled = true;
    button.textContent = L.preparing;
    let failed = false;
    try {
      const { exportFilm } = await import('../widgets/marico-export');
      await exportFilm(content, format);
    } catch (err) {
      console.error(err);
      failed = true;
    }
    pdfBtn.disabled = pptBtn.disabled = false;
    button.textContent = failed ? L.downloadFailed : label;
    if (failed) setTimeout(() => (button.textContent = label), 4000);
  };
  pdfBtn.addEventListener('click', () => void download(pdfBtn, 'pdf'));
  pptBtn.addEventListener('click', () => void download(pptBtn, 'pptx'));

  /* ---------- Drawing ---------- */
  const ctx = canvas.getContext('2d')!;
  let scale = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  };
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);

  void import('./marico-film').then(async (film) => {
    const assets = await film.loadAssets(content, false);
    const paint = film.painter(ctx, content, assets);
    let last = performance.now();
    const frame = (tn: number) => {
      if (!root.isConnected) {
        sizer.disconnect();
        cleanup();
        if (document.fullscreenElement === stage) void document.exitFullscreen();
        return;
      }
      // Real time, so a slow computer keeps the same pace; capped so a hidden tab does not skip whole scenes.
      const dt = Math.min(0.25, (tn - last) / 1000);
      last = tn;
      if (playing) {
        st += dt;
        prevSt += dt;
        if (!reduce) T += dt;
      }
      fade = Math.min(1, fade + dt / 0.7);
      if (playing && auto.checked && st > scenes[cur].seconds) {
        if (cur < scenes.length - 1) go(cur + 1);
        else ((playing = false), setPlay());
      }
      scale = canvas.width / film.W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      paint.background(T);
      if (fade < 1 && prev >= 0) paint.scene(prev, prevSt, 1 - film.eio(fade));
      paint.scene(cur, st, fade < 1 ? film.eio(fade) : 1);
      segFill.forEach(
        (f, i) =>
          (f.style.width = `${i < cur ? 100 : i > cur ? 0 : Math.min(100, (st / scenes[cur].seconds) * 100)}%`),
      );
      now.textContent = `${L.scene} ${cur + 1} ${L.of} ${scenes.length} · ${scenes[cur].rail}`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  caption();
  return root;
}

export const maricoPage: Page = (content) => {
  const root = h('div', { class: 'page-marico' });
  const show = () => root.replaceChildren(player(content));
  if (isUnlocked(content.marico.lock.pinHash)) show();
  else root.append(lockScreen(content, show));
  return root;
};
