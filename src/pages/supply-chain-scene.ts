/**
 * The Supply Chain 3D scene (Three.js). Loaded on demand by src/pages/supply-chain.ts,
 * so the 3D library only downloads when someone opens /supply-chain.
 */
import * as THREE from 'three';
import type { Content, SupplyChain } from '../../content/content.schema';
import { h } from '../lib/dom';

type LatLon = [number, number];
type ColorRep = string | number | THREE.Color;
type Dest = SupplyChain['destinations'][number] & { km: number };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const pad2 = (n: number) => String(n).padStart(2, '0');
const svgIcon = (d: string) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
};
const ICON = {
  prev: 'M10.5 2.5 5 8l5.5 5.5-1.4 1.4L2.2 8l6.9-6.9z',
  next: 'M5.5 2.5 11 8l-5.5 5.5 1.4 1.4L13.8 8 6.9 1.1z',
  play: 'M4 2l10 6-10 6z',
  pause: 'M4 2h3v12H4zM9 2h3v12H9z',
  replay: 'M8 2a6 6 0 1 1-5.7 4.1l1.9.6A4 4 0 1 0 8 4v2.5L4.5 3.2 8 0z',
};

/** Straight-line distance in km. */
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371,
    r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r,
    dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

/** Reads the outline SVG (one path of M/L points, x = longitude, y = -latitude). */
async function loadOutline(src: string): Promise<LatLon[]> {
  const text = await (await fetch(src)).text();
  const d = text.match(/\sd="([^"]+)"/)?.[1] ?? '';
  return d
    .split(/[MLZ]/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(/[ ,]+/).map(Number);
      return [-y, x] as LatLon;
    });
}

/** Builds the stage + side panel inside `host` and runs the scene. Returns a cleanup function. */
export function scene(
  content: Content,
  host: HTMLElement,
  stepsEl: HTMLElement,
  restart: () => void,
): () => void {
  const sc = content.supplyChain;
  const L = sc.labels;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pal =
    content.site.theme.palettes.find((p) => p.id === content.site.theme.default) ??
    content.site.theme.palettes[0];
  const BRAND = pal.colors.heading;
  const ACCENT = pal.colors.accent;
  const NAVY = pal.colors.text;
  const ORIGIN = sc.origin;
  const DESTS: Dest[] = sc.destinations.map((d) => ({ ...d, km: haversine(ORIGIN, d) }));
  const CH = sc.chapters;
  const LAST = CH.length - 1;
  const fmtKm = (n: number) => Math.round(n).toLocaleString('en-IN');
  let alive = true;

  /* ---------- DOM ---------- */
  const labelsEl = h('div', { class: 'sc-labels' });
  const fader = h('div', { class: 'sc-fader' });
  const caption = h('span', { class: 'sc-caption' }, CH[0].caption);
  const loadedTag = h('span', { class: 'sc-loaded' }, L.loadedTag);
  const loadBar = h('span');
  const loadCount = h('em');
  const loadMeter = h('span', { class: 'sc-meter' }, L.loadMeter, h('i', {}, loadBar), loadCount);
  const rail = h('ol', { class: 'sc-rail' });
  const stage = h(
    'div',
    { class: 'sc-stage', role: 'img', 'aria-label': L.stage },
    labelsEl,
    fader,
    caption,
    loadedTag,
    loadMeter,
    rail,
  );
  const chapNum = h('b');
  const chapEl = h('div', { class: 'sc-chap' }, `${L.chapter} `, chapNum, ` / ${pad2(CH.length)}`);
  const chapTitle = h('h2', { class: 'sc-chap-title' });
  const chapText = h('p', { class: 'sc-chap-text' });
  const live = h('div', { class: 'sc-live' });
  const statsEl = h('div', { class: 'sc-stats' });
  statsEl.hidden = true;
  const prevBtn = h(
    'button',
    { type: 'button', class: 'sc-btn icon', 'aria-label': L.previous },
    svgIcon(ICON.prev),
  );
  const playBtn = h('button', { type: 'button', class: 'sc-btn primary' });
  const nextBtn = h(
    'button',
    { type: 'button', class: 'sc-btn icon', 'aria-label': L.next },
    svgIcon(ICON.next),
  );
  const replayBtn = h('button', { type: 'button', class: 'sc-btn' }, svgIcon(ICON.replay), L.replay);
  const autoBox = h('input', { type: 'checkbox', checked: true });
  const panel = h(
    'aside',
    { class: 'sc-panel', 'aria-live': 'polite' },
    chapEl,
    chapTitle,
    chapText,
    live,
    statsEl,
    h(
      'div',
      { class: 'sc-controls' },
      prevBtn,
      playBtn,
      nextBtn,
      replayBtn,
      h('label', { class: 'sc-toggle' }, autoBox, ` ${L.autoAdvance}`),
    ),
    L.note ? h('p', { class: 'sc-note' }, L.note) : null,
  );
  host.append(stage, panel);

  /* ---------- Chapters, panel and rail ---------- */
  const chOf: Record<string, number> = {};
  CH.forEach((c, i) => (c.cities ?? []).forEach((n) => (chOf[n] = i)));
  const S = { ch: 0, prog: 0, paused: false, auto: true, skipped: false, status: L.statusLoading };
  let mapReady = false;
  let chapterDone = false;
  const setStep = (n: number) => {
    [...stepsEl.children].forEach((li, k) => {
      const s = k + 1;
      li.classList.toggle('active', s === n);
      li.classList.toggle('done', s < n || n === 4);
    });
  };
  const railItems = CH.map((c, i) => {
    const fill = h('span', { class: 'fill' });
    const btn = h(
      'button',
      { type: 'button', 'aria-label': `${L.chapter} ${i + 1}: ${c.railLabel}` },
      h('span', { class: 'bar' }, fill),
      h('span', { class: 'rl' }, h('span', { class: 'n' }, pad2(i + 1)), c.railLabel),
    );
    btn.addEventListener('click', () => goChapter(i));
    const li = h('li', {}, btn);
    rail.append(li);
    return { li, fill };
  });

  type LiveRefs = {
    lv?: HTMLElement;
    lm?: HTMLElement;
    ls?: HTMLElement;
    lst?: HTMLElement;
    ld?: HTMLElement;
    lr?: HTMLElement;
    lk?: HTMLElement;
  };
  let refs: LiveRefs = {};
  const row = (k: string, v: HTMLElement) => h('div', { class: 'row' }, h('span', { class: 'k' }, k), v);
  const swapIn = (e: HTMLElement) => {
    e.classList.remove('sc-swap');
    void e.offsetWidth;
    e.classList.add('sc-swap');
  };
  function setChapterUI(i: number) {
    S.ch = i;
    S.prog = 0;
    const c = CH[i];
    chapNum.textContent = pad2(i + 1);
    chapTitle.textContent = c.title;
    chapText.textContent = c.text;
    [chapTitle, chapText].forEach(swapIn);
    caption.textContent = c.caption;
    railItems.forEach((r, k) => r.li.classList.toggle('cur', k === i));
    if (c.kind === 'loading' || c.kind === 'dispatch') {
      const lv = h('span', { class: 'v' }, '0%');
      const lm = h('i');
      const ls = h('span', { class: 'v' }, '0');
      const lst = h('span', { class: 'sc-status' }, S.status);
      live.replaceChildren(
        h(
          'div',
          { class: 'row block' },
          h('div', { class: 'row-top' }, h('span', { class: 'k' }, L.loadFactor), lv),
          h('div', { class: 'bar' }, lm),
        ),
        row(L.palletsOnDock, ls),
        row(L.truckStatus, lst),
      );
      refs = { lv, lm, ls, lst };
      live.hidden = false;
      statsEl.hidden = true;
    } else if (c.kind === 'region') {
      const ld = h('em', {}, '0');
      const lr = h('span', { class: 'v' }, '0');
      const lk = h('span', {}, '0');
      live.replaceChildren(
        row(L.delivered, h('span', { class: 'v' }, ld, ` / ${DESTS.length}`)),
        row(L.onRoad, lr),
        row(L.distance, h('span', { class: 'v' }, lk, ` ${L.km}`)),
      );
      refs = { ld, lr, lk };
      live.hidden = false;
      statsEl.hidden = true;
    } else {
      statsEl.replaceChildren(
        ...sc.stats.map((s, k) => {
          const e = h(
            'div',
            {},
            h('strong', {}, `${s.prefix ?? ''}${s.value}`, s.suffix ? h('sup', {}, s.suffix) : null),
            h('span', {}, s.label),
          );
          e.classList.add('sc-swap');
          e.style.animationDelay = `${0.1 + k * 0.08}s`;
          return e;
        }),
      );
      statsEl.hidden = false;
      live.hidden = true;
      refs = {};
    }
    setStep(c.kind === 'loading' ? 1 : c.kind === 'delivered' ? 4 : 2);
  }
  const syncPlay = () =>
    playBtn.replaceChildren(svgIcon(S.paused ? ICON.play : ICON.pause), S.paused ? L.play : L.pause);
  syncPlay();
  playBtn.addEventListener('click', () => {
    S.paused = !S.paused;
    syncPlay();
  });
  prevBtn.addEventListener('click', () => goChapter(S.ch - 1));
  nextBtn.addEventListener('click', () => goChapter(S.ch + 1));
  autoBox.addEventListener('change', () => {
    S.auto = autoBox.checked;
    if (S.auto && CH[S.ch].kind === 'region' && chapterDone) goChapter(S.ch + 1, true);
  });
  replayBtn.addEventListener('click', () => restart());
  function goChapter(i: number, keepAuto = false) {
    if (!mapReady) return;
    i = Math.max(0, Math.min(LAST, i));
    if (!keepAuto) {
      S.auto = false;
      autoBox.checked = false;
    }
    S.paused = false;
    syncPlay();
    // Back into the dock scene replays it; forward from the dock skips straight to the first map chapter.
    if (i === S.ch && i <= 1) return;
    if (i < S.ch && i <= 1) {
      restart();
      return;
    }
    if (i <= 1) i = 2;
    S.skipped = true;
    void runChapter(i, S.ch < 2);
  }
  setChapterUI(0);

  /* ---------- Renderer ---------- */
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); // keeps the last frame readable for the PDF;
  } catch {
    renderer = null;
  }
  if (!renderer) {
    stage.append(h('div', { class: 'sc-webgl' }, L.noWebgl));
    loadMeter.hidden = true;
    labelsEl.hidden = true;
    setChapterUI(LAST);
    return () => {};
  }
  const R3 = renderer;
  R3.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  R3.shadowMap.enabled = true;
  R3.shadowMap.type = THREE.PCFSoftShadowMap;
  R3.outputEncoding = THREE.sRGBEncoding;
  R3.toneMapping = THREE.ACESFilmicToneMapping;
  R3.toneMappingExposure = 1.0;
  stage.prepend(R3.domElement);

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 800);
  const lin = (c: ColorRep) => new THREE.Color(c).convertSRGBToLinear();
  const textures: THREE.Texture[] = [];
  const maxAniso = R3.capabilities.getMaxAnisotropy();

  function resize() {
    const w = stage.clientWidth,
      hgt = stage.clientHeight;
    if (!w || !hgt) return;
    R3.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.fov = w / hgt < 1.3 ? 50 : 38;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /* ---------- Procedural textures (scene materials, not theme colours) ---------- */
  type Draw = (c: CanvasRenderingContext2D, w: number, hgt: number) => void;
  function canvasTex(w: number, hgt: number, draw: Draw, rx?: number, ry?: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    draw(c.getContext('2d')!, w, hgt);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    if (rx) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry || rx);
    }
    textures.push(t);
    return t;
  }
  function grain(c: CanvasRenderingContext2D, w: number, hgt: number, base: string, amp: number) {
    c.fillStyle = base;
    c.fillRect(0, 0, w, hgt);
    const img = c.getImageData(0, 0, w, hgt),
      d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() - 0.5) * amp;
      d[i] += v;
      d[i + 1] += v;
      d[i + 2] += v;
    }
    c.putImageData(img, 0, 0);
  }
  function blotches(
    c: CanvasRenderingContext2D,
    w: number,
    hgt: number,
    n: number,
    a: number,
    cols: string[],
  ) {
    c.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.arc(Math.random() * w, Math.random() * hgt, 8 + Math.random() * 46, 0, 7);
      c.fill();
    }
    c.globalAlpha = 1;
  }
  const concreteTex = canvasTex(
    512,
    512,
    (c, w, hgt) => {
      grain(c, w, hgt, '#86898f', 26);
      blotches(c, w, hgt, 46, 0.12, ['#5d6068', '#a6a9b0', '#6f6a62']);
      c.strokeStyle = '#55585e';
      c.lineWidth = 3;
      c.strokeRect(1.5, 1.5, w - 3, hgt - 3);
    },
    40,
    40,
  );
  const dockTex = canvasTex(
    256,
    256,
    (c, w, hgt) => {
      grain(c, w, hgt, '#a3a6ac', 22);
      blotches(c, w, hgt, 18, 0.1, ['#7a7d84', '#c0c3c9']);
    },
    3,
    3,
  );
  const claddingTex = canvasTex(
    256,
    256,
    (c, w, hgt) => {
      c.fillStyle = '#c3c8d0';
      c.fillRect(0, 0, w, hgt);
      for (let x = 0; x < w; x += 16) {
        c.fillStyle = '#a6acb6';
        c.fillRect(x, 0, 3, hgt);
        c.fillStyle = '#d8dce2';
        c.fillRect(x + 3, 0, 2, hgt);
      }
      const g = c.createLinearGradient(0, 0, 0, hgt);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(60,50,40,.12)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, hgt);
    },
    12,
    2,
  );
  const rollerTex = canvasTex(
    128,
    128,
    (c, w, hgt) => {
      c.fillStyle = '#9ca3ad';
      c.fillRect(0, 0, w, hgt);
      for (let y = 0; y < hgt; y += 8) {
        c.fillStyle = '#7d848f';
        c.fillRect(0, y, w, 2);
        c.fillStyle = '#b4bac3';
        c.fillRect(0, y + 2, w, 1);
      }
    },
    1,
    3,
  );
  const hazardTex = canvasTex(
    256,
    32,
    (c, w, hgt) => {
      c.fillStyle = '#e1ae2c';
      c.fillRect(0, 0, w, hgt);
      c.fillStyle = '#17181b';
      for (let x = -32; x < w + 32; x += 32) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x + 16, 0);
        c.lineTo(x + 16 - hgt, hgt);
        c.lineTo(x - hgt, hgt);
        c.closePath();
        c.fill();
      }
    },
    12,
    1,
  );
  const cartonTex = canvasTex(512, 512, (c, w, hgt) => {
    grain(c, w, hgt, '#b6884f', 16);
    c.strokeStyle = '#7a5631';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, hgt);
    c.stroke();
    for (let j = 1; j < 3; j++) {
      c.beginPath();
      c.moveTo(0, (j * hgt) / 3);
      c.lineTo(w, (j * hgt) / 3);
      c.stroke();
    }
    c.fillStyle = 'rgba(226,194,140,.6)';
    for (let j = 0; j < 3; j++) c.fillRect(0, (j * hgt) / 3 + hgt / 6 - 11, w, 22);
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 2; i++) c.fillRect(i * (w / 2) + 26, j * (hgt / 3) + 26, 46, 30);
  });
  const trailerTex = canvasTex(1024, 256, (c, w, hgt) => {
    const g = c.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, '#f5f7fa');
    g.addColorStop(1, '#dce1e8');
    c.fillStyle = g;
    c.fillRect(0, 0, w, hgt);
    c.fillStyle = '#c7ccd6';
    for (let x = 0; x < w; x += 46) c.fillRect(x, 0, 2, hgt);
    c.fillStyle = NAVY;
    c.fillRect(0, hgt - 34, w, 22);
    c.fillStyle = ACCENT;
    c.fillRect(0, hgt - 40, w, 5);
  });
  const skyTex = canvasTex(4, 512, (c, w, hgt) => {
    const g = c.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, '#1b2540');
    g.addColorStop(0.42, '#46526f');
    g.addColorStop(0.7, '#a7867c');
    g.addColorStop(1, '#d9a978');
    c.fillStyle = g;
    c.fillRect(0, 0, w, hgt);
  });
  const logoTex = new THREE.TextureLoader().load(content.site.logo);
  logoTex.encoding = THREE.sRGBEncoding;
  logoTex.anisotropy = maxAniso;
  textures.push(logoTex);

  /* ---------- Materials ---------- */
  type MOpts = THREE.MeshStandardMaterialParameters & {
    color?: ColorRep;
    emissive?: ColorRep;
  };
  const M = (o: MOpts) => {
    if (o.color !== undefined) o.color = lin(o.color);
    if (o.emissive !== undefined) o.emissive = lin(o.emissive);
    return new THREE.MeshStandardMaterial(o);
  };
  const mat = {
    ground: M({ map: concreteTex, color: 0xffffff, roughness: 0.95 }),
    dock: M({ map: dockTex, color: 0xffffff, roughness: 0.9 }),
    paint: M({ color: 0xd8a634, roughness: 0.7 }),
    hazard: M({ map: hazardTex, color: 0xffffff, roughness: 0.7 }),
    wall: M({ map: claddingTex, color: 0xffffff, roughness: 0.65, metalness: 0.2 }),
    roof: M({ color: 0x7c828c, roughness: 0.55, metalness: 0.4 }),
    opening: M({ color: 0x0c0e12, emissive: 0x2a1e12, roughness: 1 }),
    roller: M({ map: rollerTex, color: 0xffffff, roughness: 0.5, metalness: 0.35 }),
    seal: M({ color: 0x18191c, roughness: 1 }),
    steel: M({ color: 0x8a9099, roughness: 0.45, metalness: 0.7 }),
    steelDark: M({ color: 0x2b2f36, roughness: 0.55, metalness: 0.6 }),
    chrome: M({ color: 0xe3e7ec, roughness: 0.12, metalness: 1 }),
    rubber: M({ color: 0x141518, roughness: 0.9 }),
    rim: M({ color: 0xbfc5cd, roughness: 0.3, metalness: 0.85 }),
    floor: M({ color: 0x5c4a3a, roughness: 0.9 }),
    trailerSide: M({ map: trailerTex, color: 0xffffff, roughness: 0.4, metalness: 0.15 }),
    trailerPlain: M({ color: 0xe6e9ee, roughness: 0.4, metalness: 0.15 }),
    trailerRoof: M({ color: 0xd5d9e0, roughness: 0.5, metalness: 0.2 }),
    cab: M({ color: BRAND, roughness: 0.28, metalness: 0.5 }),
    glass: M({ color: 0x141c2a, roughness: 0.05, metalness: 0.9 }),
    grille: M({ color: 0x1a1d22, roughness: 0.4, metalness: 0.6 }),
    headlight: M({ color: 0xffffff, emissive: 0xfff2d0, roughness: 0.2 }),
    tail: M({ color: 0x7a0c0c, emissive: 0x5a0000, roughness: 0.3 }),
    amber: M({ color: 0xf29a1f, emissive: 0x7a4300, roughness: 0.3 }),
    navy: M({ color: NAVY, roughness: 0.55, metalness: 0.1 }),
    logo: new THREE.MeshStandardMaterial({
      map: logoTex,
      transparent: true,
      roughness: 0.45,
      metalness: 0.05,
    }),
    yellow: M({ color: 0xe2a72c, roughness: 0.45, metalness: 0.15 }),
    carton: M({ map: cartonTex, color: 0xffffff, roughness: 0.85 }),
    pallet: M({ color: 0xa27a4f, roughness: 0.9 }),
    wrap: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.15,
      depthWrite: false,
    }),
    vest: M({ color: 0xe9c21d, roughness: 0.7 }),
    skin: M({ color: 0x8f6a50, roughness: 0.8 }),
    helmet: M({ color: 0xf2f2f2, roughness: 0.4 }),
    dark: M({ color: 0x23272f, roughness: 0.85 }),
    beacon: M({ color: 0xff9a1f, emissive: 0xff7a00, roughness: 0.3 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff0d2 }),
    landTop: M({ color: 0xf7f9fe, roughness: 0.92 }),
    landSide: M({ color: BRAND, roughness: 0.65, metalness: 0.05 }),
    disk: M({ color: BRAND, roughness: 0.5 }),
    pin: M({ color: ACCENT, emissive: 0x6b4500, roughness: 0.35 }),
    route: new THREE.MeshBasicMaterial({ color: lin(BRAND) }),
    track: new THREE.MeshBasicMaterial({
      color: lin(BRAND),
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
    miniTrailer: M({ color: ACCENT, roughness: 0.4 }),
  };
  const fadeMat = (color: ColorRep) =>
    new THREE.MeshBasicMaterial({
      color: lin(color),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

  /* ---------- Mesh helpers ---------- */
  function mk(
    geo: THREE.BufferGeometry,
    m: THREE.Material | THREE.Material[],
    parent?: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
    cast = true,
    recv = true,
  ) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = cast;
    o.receiveShadow = recv;
    if (parent) parent.add(o);
    return o;
  }
  const box = (
    w: number,
    hh: number,
    d: number,
    m: THREE.Material,
    parent?: THREE.Object3D,
    x?: number,
    y?: number,
    z?: number,
    cast?: boolean,
    recv?: boolean,
  ) => mk(new THREE.BoxGeometry(w, hh, d), m, parent, x, y, z, cast, recv);
  function logoPanel(w: number, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.Group();
    const lh = w / 3.94;
    mk(new THREE.PlaneGeometry(w * 1.1, lh * 1.5), mat.navy, g, 0, 0, 0, false, true);
    mk(new THREE.PlaneGeometry(w, lh), mat.logo, g, 0, 0, 0.012, false, false);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    parent.add(g);
    return g;
  }
  function makeWheel(r: number, w: number) {
    const g = new THREE.Group();
    const tyre = new THREE.CylinderGeometry(r, r, w, 28);
    tyre.rotateX(Math.PI / 2);
    mk(tyre, mat.rubber, g);
    const rim = new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 20);
    rim.rotateX(Math.PI / 2);
    mk(rim, mat.rim, g, 0, 0, 0, false, false);
    const hub = new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.05, 10);
    hub.rotateX(Math.PI / 2);
    mk(hub, mat.steelDark, g, 0, 0, 0, false, false);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mk(
        new THREE.BoxGeometry(r * 0.09, r * 0.09, w + 0.04),
        mat.steelDark,
        g,
        Math.cos(a) * r * 0.38,
        Math.sin(a) * r * 0.38,
        0,
        false,
        false,
      );
    }
    return g;
  }
  function makePallet() {
    const g = new THREE.Group();
    box(1.2, 0.03, 1.0, mat.pallet, g, 0, 0.015, 0);
    [-0.42, 0, 0.42].forEach((z) => box(1.2, 0.09, 0.12, mat.pallet, g, 0, 0.065, z));
    box(1.2, 0.04, 1.0, mat.pallet, g, 0, 0.13, 0);
    box(1.14, 1.0, 0.96, mat.carton, g, 0, 0.65, 0);
    mk(new THREE.BoxGeometry(1.17, 1.03, 0.99), mat.wrap, g, 0, 0.65, 0, false, false);
    return g;
  }
  function makePerson(parent: THREE.Object3D, x: number, z: number, ry: number) {
    const g = new THREE.Group();
    [0.1, -0.1].forEach((dz) =>
      mk(new THREE.CylinderGeometry(0.075, 0.07, 0.86, 10), mat.dark, g, 0, 0.43, dz),
    );
    mk(new THREE.CylinderGeometry(0.17, 0.19, 0.6, 14), mat.vest, g, 0, 1.15, 0);
    [0.23, -0.23].forEach((dz) =>
      mk(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), mat.vest, g, 0, 1.12, dz),
    );
    mk(new THREE.SphereGeometry(0.115, 16, 12), mat.skin, g, 0, 1.58, 0);
    mk(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.helmet, g, 0, 1.61, 0);
    box(0.04, 0.3, 0.22, mat.dark, g, 0.16, 1.05, 0.18);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    parent.add(g);
    return g;
  }

  /* ---------- Lights and sky ---------- */
  const hemi = new THREE.HemisphereLight(0xaebbd8, 0x3b342d, 0.65);
  world.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a6, 1.35);
  sun.position.set(30, 26, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  world.add(sun, sun.target);
  sun.target.position.set(2, 0, 0);
  world.background = skyTex;
  world.fog = new THREE.Fog(0x8a7f86, 60, 230);

  /* ===== Stage 1: loading dock ===== */
  const dockG = new THREE.Group();
  world.add(dockG);
  const ground = mk(new THREE.PlaneGeometry(400, 400), mat.ground, dockG, 0, 0, 0, false, true);
  ground.rotation.x = -Math.PI / 2;
  [-9.7, -5.8, -1.9, 1.9, 5.8, 9.7].forEach((z) =>
    box(18, 0.02, 0.14, mat.paint, dockG, 8, 0.011, z, false, true),
  );
  box(8, 1.3, 26, mat.dock, dockG, -5, 0.65, 0);
  const edgeTop = mk(new THREE.PlaneGeometry(26, 0.28), mat.hazard, dockG, -1.15, 1.302, 0, false, true);
  edgeTop.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  const edgeFace = mk(new THREE.PlaneGeometry(26, 0.22), mat.hazard, dockG, -0.995, 1.17, 0, false, true);
  edgeFace.rotation.y = Math.PI / 2;
  [1.6, -1.6, 6.2, 9.3, -6.2, -9.3].forEach((z) => box(0.18, 0.5, 0.35, mat.rubber, dockG, -0.9, 0.85, z));
  box(8.6, 0.25, 26, mat.roof, dockG, -5, 6.6, 0);
  [-12, -4.2, 4.2, 12].forEach((z) =>
    mk(new THREE.CylinderGeometry(0.12, 0.12, 5.3, 12), mat.steel, dockG, -1.4, 3.95, z),
  );
  [-8, -3, 3, 8].forEach((z) => box(1.2, 0.06, 0.3, mat.lamp, dockG, -3.5, 6.45, z, false, false));
  const dockLamp = new THREE.PointLight(0xffd9a8, 1.1, 22, 2);
  dockLamp.position.set(-4, 6.0, 0);
  dockG.add(dockLamp);
  box(31, 11, 40, mat.wall, dockG, -24.5, 5.5, 0);
  box(31.4, 0.5, 40.4, mat.roof, dockG, -24.5, 11.2, 0);
  box(0.06, 4.0, 3.4, mat.opening, dockG, -8.97, 3.3, 0, false, false);
  box(0.35, 0.45, 3.6, mat.steel, dockG, -8.8, 5.55, 0);
  [1.85, -1.85].forEach((z) => box(0.3, 4.3, 0.3, mat.seal, dockG, -8.85, 3.45, z));
  box(0.3, 0.4, 4.0, mat.seal, dockG, -8.85, 5.85, 0);
  [7.75, -7.75].forEach((z) => {
    box(0.06, 4.0, 3.4, mat.roller, dockG, -8.97, 3.3, z, false, true);
    [1.85, -1.85].forEach((dz) => box(0.3, 4.3, 0.3, mat.seal, dockG, -8.85, 3.45, z + dz));
  });
  [0, 7.75, -7.75].forEach((z) => box(0.2, 0.12, 0.6, mat.lamp, dockG, -8.85, 6.25, z, false, false));
  logoPanel(6.4, dockG, -8.94, 8.5, 0, Math.PI / 2);
  logoPanel(10, dockG, -24.5, 7.4, 20.02, 0);
  [
    [16, -15],
    [16, 15],
    [36, 0],
  ].forEach(([x, z]) => {
    mk(new THREE.CylinderGeometry(0.12, 0.16, 9, 10), mat.steel, dockG, x, 4.5, z);
    box(1.2, 0.18, 0.5, mat.lamp, dockG, x - 0.5, 9.0, z, false, false);
  });
  const dockTop = new THREE.Group();
  dockTop.position.y = 1.3;
  dockG.add(dockTop);
  makePerson(dockTop, -7.8, -3.2, -0.4);
  [
    [-6.5, -5.2],
    [-5.1, -5.2],
    [-6.5, -6.6],
  ].forEach(([x, z]) => {
    const p = makePallet();
    p.position.set(x, 0, z);
    dockTop.add(p);
  });

  function makeTrailer() {
    const g = new THREE.Group();
    const LEN = 13.6,
      X0 = -1,
      XC = X0 + LEN / 2;
    box(LEN, 0.15, 2.5, mat.floor, g, XC, 1.225, 0);
    box(LEN, 0.06, 2.5, mat.trailerRoof, g, XC, 4.0, 0);
    box(0.06, 2.7, 2.5, mat.trailerPlain, g, X0 + LEN - 0.03, 2.65, 0);
    [1.225, -1.225].forEach((z) => box(LEN, 2.7, 0.05, mat.trailerSide, g, XC, 2.65, z));
    [1.25, -1.25].forEach((z) => box(0.12, 2.85, 0.1, mat.steelDark, g, X0 + 0.05, 2.6, z));
    box(0.12, 0.16, 2.6, mat.steelDark, g, X0 + 0.05, 4.02, 0);
    box(0.1, 0.12, 2.3, mat.steelDark, g, X0 + 0.25, 0.62, 0);
    [0.9, -0.9].forEach((z) => box(0.08, 0.5, 0.08, mat.steelDark, g, X0 + 0.3, 0.9, z));
    [1.0, -1.0].forEach((z) => box(0.04, 0.12, 0.3, mat.tail, g, X0 - 0.02, 1.05, z, false));
    for (let x = X0 + 1; x < X0 + LEN; x += 3)
      [1.255, -1.255].forEach((z) => box(0.12, 0.06, 0.02, mat.amber, g, x, 1.45, z, false, false));
    logoPanel(5.2, g, XC, 2.8, 1.262, 0);
    logoPanel(5.2, g, XC, 2.8, -1.262, Math.PI);
    [0.5, -0.5].forEach((z) => box(LEN - 0.5, 0.22, 0.12, mat.steelDark, g, XC, 1.04, z));
    [0.85, -0.85].forEach((z) => box(0.1, 0.8, 0.1, mat.steelDark, g, X0 + LEN - 3.2, 0.62, z));
    [1.2, -1.2].forEach((z) => {
      box(6.5, 0.08, 0.04, mat.steelDark, g, X0 + 6.2, 0.85, z);
      box(6.5, 0.08, 0.04, mat.steelDark, g, X0 + 6.2, 0.55, z);
    });
    const wheels: THREE.Group[] = [];
    [X0 + 1.6, X0 + 2.95].forEach((x) =>
      [1.08, 0.74, -0.74, -1.08].forEach((z) => {
        const w = makeWheel(0.52, 0.3);
        w.position.set(x, 0.52, z);
        g.add(w);
        wheels.push(w);
      }),
    );
    [1.0, -1.0].forEach((z) => box(0.03, 0.55, 0.62, mat.rubber, g, X0 + 3.65, 0.55, z));
    const doors: { pivot: THREE.Group; s: number }[] = [];
    (
      [
        [1.32, 1],
        [-1.32, -1],
      ] as const
    ).forEach(([z, s]) => {
      const pivot = new THREE.Group();
      pivot.position.set(X0 - 0.02, 2.62, z);
      g.add(pivot);
      box(0.05, 2.72, 1.28, mat.trailerPlain, pivot, 0, 0, -s * 0.64);
      [-0.3, -0.95].forEach((dz) =>
        mk(new THREE.CylinderGeometry(0.025, 0.025, 2.7, 8), mat.chrome, pivot, -0.05, 0, s * dz),
      );
      doors.push({ pivot, s });
    });
    return { g, wheels, doors };
  }
  function makeTractor() {
    const g = new THREE.Group();
    [0.45, -0.45].forEach((z) => box(7.0, 0.28, 0.14, mat.steelDark, g, 13.6, 0.95, z));
    box(1.4, 0.12, 1.9, mat.steelDark, g, 11.6, 1.15, 0);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(2.35, 0);
    s.lineTo(2.38, 1.35);
    s.lineTo(2.26, 2.75);
    s.quadraticCurveTo(2.2, 3.05, 1.9, 3.05);
    s.lineTo(0.12, 3.05);
    s.quadraticCurveTo(0, 3.05, 0, 2.9);
    s.lineTo(0, 0);
    const cg = new THREE.ExtrudeGeometry(s, {
      depth: 2.3,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.08,
      bevelSegments: 3,
      curveSegments: 8,
    });
    cg.translate(0, 0, -1.15);
    mk(cg, mat.cab, g, 14.55, 1.15, 0);
    const ws = box(0.05, 1.2, 2.1, mat.glass, g, 16.95, 3.25, 0, false, false);
    ws.rotation.z = 0.085;
    [1.245, -1.245].forEach((z) => box(0.95, 0.8, 0.04, mat.glass, g, 16.1, 3.3, z, false, false));
    box(0.04, 0.95, 1.5, mat.grille, g, 17.03, 1.95, 0, false, false);
    for (let i = 0; i < 5; i++) box(0.03, 0.04, 1.45, mat.chrome, g, 17.06, 1.6 + i * 0.18, 0, false, false);
    box(0.3, 0.42, 2.5, mat.steel, g, 17.08, 1.0, 0);
    [0.85, -0.85].forEach((z) => box(0.05, 0.18, 0.45, mat.headlight, g, 17.24, 1.08, z, false, false));
    box(0.35, 0.08, 2.3, mat.cab, g, 17.05, 4.12, 0);
    [1.55, -1.55].forEach((z) => {
      box(0.06, 0.45, 0.18, mat.dark, g, 16.85, 3.1, z);
      box(0.04, 0.04, 0.35, mat.dark, g, 16.85, 3.2, z * 0.89);
    });
    [1.0, -1.0].forEach((z) => {
      const tank = new THREE.CylinderGeometry(0.32, 0.32, 1.3, 20);
      tank.rotateZ(Math.PI / 2);
      mk(tank, mat.chrome, g, 13.7, 0.85, z);
      mk(new THREE.CylinderGeometry(0.09, 0.09, 3.3, 12), mat.chrome, g, 14.35, 2.75, z * 1.05);
      box(0.5, 0.06, 0.3, mat.steel, g, 15.7, 0.75, z * 1.2);
    });
    logoPanel(1.4, g, 15.35, 2.15, 1.24, 0);
    logoPanel(1.4, g, 15.35, 2.15, -1.24, Math.PI);
    const wheels: THREE.Group[] = [];
    [11.2, 12.55].forEach((x) =>
      [1.08, 0.74, -0.74, -1.08].forEach((z) => {
        const w = makeWheel(0.52, 0.3);
        w.position.set(x, 0.52, z);
        g.add(w);
        wheels.push(w);
      }),
    );
    [1.08, -1.08].forEach((z) => {
      const w = makeWheel(0.52, 0.32);
      w.position.set(16.1, 0.52, z);
      g.add(w);
      wheels.push(w);
    });
    return { g, wheels };
  }
  const truck = new THREE.Group();
  dockG.add(truck);
  const trailer = makeTrailer();
  const tractor = makeTractor();
  truck.add(trailer.g, tractor.g);
  const truckWheels = trailer.wheels.concat(tractor.wheels);
  const setDoors = (f: number) =>
    trailer.doors.forEach((d) => (d.pivot.rotation.y = d.s * 1.5 * Math.PI * f));
  setDoors(1);
  const parked = makeTrailer();
  parked.g.position.z = -7.75;
  dockG.add(parked.g);

  // 17 pallets already in the trailer, 3 staged on the dock
  const rowX = (r: number) => 11.35 - 1.25 * r;
  for (let r = 0; r <= 8; r++)
    for (const z of [-0.58, 0.58]) {
      if (r === 8 && z > 0) continue;
      const p = makePallet();
      p.position.set(rowX(r), 1.3, z);
      truck.add(p);
    }
  const PX = [-5.6, -4.2, -2.8],
    PZ = 5.2;
  const SLOTS: [number, number][] = [
    [rowX(8), 0.58],
    [rowX(9), -0.58],
    [rowX(9), 0.58],
  ];
  const staged = PX.map((x) => {
    const p = makePallet();
    p.position.set(x, 0, PZ);
    p.rotation.y = -Math.PI / 2;
    dockTop.add(p);
    return p;
  });
  const TOTAL = 20;
  let loaded = 17;
  const updateMeter = () => {
    loadBar.style.width = `${(loaded / TOTAL) * 100}%`;
    loadCount.textContent = `${loaded} / ${TOTAL}`;
  };
  updateMeter();

  // forklift
  const FH_LOW = 0.04,
    FH_HIGH = 0.22;
  function makeForklift() {
    const g = new THREE.Group();
    box(1.6, 0.75, 1.1, mat.yellow, g, -0.15, 0.62, 0);
    box(0.55, 0.95, 1.12, mat.steelDark, g, -1.15, 0.72, 0);
    box(0.5, 0.12, 0.55, mat.rubber, g, -0.4, 1.06, 0);
    box(0.12, 0.55, 0.5, mat.rubber, g, -0.66, 1.35, 0);
    [
      [-0.85, 0.5],
      [-0.85, -0.5],
      [0.45, 0.5],
      [0.45, -0.5],
    ].forEach(([x, z]) => box(0.07, 1.25, 0.07, mat.steelDark, g, x, 1.6, z));
    box(1.42, 0.06, 1.08, mat.steelDark, g, -0.2, 2.24, 0);
    [0.34, -0.34].forEach((z) => box(0.1, 2.3, 0.09, mat.steelDark, g, 0.78, 1.2, z));
    box(0.1, 0.1, 0.78, mat.steelDark, g, 0.78, 2.3, 0);
    const swg = new THREE.TorusGeometry(0.15, 0.025, 8, 20);
    swg.rotateY(Math.PI / 2);
    swg.rotateZ(0.5);
    mk(swg, mat.rubber, g, 0.12, 1.3, 0);
    const op = new THREE.Group();
    op.position.set(-0.4, 0, 0);
    g.add(op);
    box(0.42, 0.14, 0.34, mat.dark, op, 0.15, 1.18, 0);
    mk(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 14), mat.vest, op, 0, 1.43, 0);
    [0.17, -0.17].forEach((z) => {
      const a = mk(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), mat.vest, op, 0.24, 1.42, z);
      a.rotation.z = -1.1;
    });
    mk(new THREE.SphereGeometry(0.115, 16, 12), mat.skin, op, 0, 1.82, 0);
    mk(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.helmet, op, 0, 1.85, 0);
    const wheels: THREE.Group[] = [];
    [
      [0.45, 0.5, 0.3],
      [0.45, -0.5, 0.3],
      [-0.85, 0.48, 0.25],
      [-0.85, -0.48, 0.25],
    ].forEach(([x, z, r]) => {
      const w = makeWheel(r, 0.22);
      w.position.set(x, r, z);
      g.add(w);
      wheels.push(w);
    });
    const car = new THREE.Group();
    car.position.set(0, FH_LOW, 0);
    g.add(car);
    box(0.06, 0.9, 0.9, mat.steelDark, car, 0.86, 0.47, 0);
    [0.22, -0.22].forEach((z) => box(1.15, 0.045, 0.1, mat.steelDark, car, 1.45, 0.03, z));
    mk(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), mat.beacon, g, -0.7, 2.32, 0);
    dockTop.add(g);
    return { g, car, wheels };
  }
  const forklift = makeForklift();
  const fk = { x: PX[0], z: 2.5, yaw: -Math.PI / 2, fh: FH_LOW, rev: false };
  function applyFork() {
    const px = forklift.g.position.x,
      pz = forklift.g.position.z;
    forklift.g.position.set(fk.x, 0, fk.z);
    forklift.g.rotation.y = fk.yaw;
    forklift.car.position.y = fk.fh;
    const d = Math.hypot(fk.x - px, fk.z - pz) * (fk.rev ? -1 : 1);
    forklift.wheels.forEach((w) => (w.rotation.z -= d / 0.28));
  }
  applyFork();

  /* ===== Stage 2: India map (white land, brand-blue routes, saffron trucks) ===== */
  const mapG = new THREE.Group();
  mapG.visible = false;
  world.add(mapG);
  const SX = 0.95,
    TOP = 0.52,
    RY = TOP + 0.05;
  const mp = (lat: number, lon: number, y: number) => new THREE.Vector3((lon - 82) * SX, y, -(lat - 22));
  const LON_A = 68,
    LON_B = 97.5,
    LAT_A = 8,
    LAT_B = 37.2;
  type P2 = (lat: number, lon: number) => [number, number];
  const trace = (g: CanvasRenderingContext2D, pts: LatLon[], P: P2) => {
    g.beginPath();
    pts.forEach(([la, lo], i) => {
      const [x, y] = P(la, lo);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
  };
  const OC: LatLon = [ORIGIN.lat, ORIGIN.lon];
  const corridors: LatLon[][] = DESTS.map((d) => [OC, ...(d.via as LatLon[]), [d.lat, d.lon]]);

  function landTex(outline: LatLon[]) {
    const W = 1024,
      H = 1024;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const P: P2 = (lat, lon) => [
      ((lon - LON_A) / (LON_B - LON_A)) * W,
      ((LAT_B - lat) / (LAT_B - LAT_A)) * H,
    ];
    g.fillStyle = '#f6f8fd';
    g.fillRect(0, 0, W, H);
    g.save();
    trace(g, outline, P);
    g.closePath();
    g.clip();
    g.fillStyle = '#f6f8fd';
    g.fillRect(0, 0, W, H);
    const brand = new THREE.Color(BRAND);
    const rgba = (a: number) =>
      `rgba(${Math.round(brand.r * 255)}, ${Math.round(brand.g * 255)}, ${Math.round(brand.b * 255)}, ${a})`;
    g.fillStyle = rgba(0.22);
    for (let lat = LAT_A; lat <= LAT_B; lat += 0.48)
      for (let lon = LON_A; lon <= LON_B; lon += 0.48) {
        const [x, y] = P(lat, lon);
        g.beginPath();
        g.arc(x, y, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = rgba(0.18);
    g.lineWidth = 2.0;
    corridors.forEach((r) => {
      trace(g, r, P);
      g.stroke();
    });
    // Crisp inner border stroke along the coastline
    trace(g, outline, P);
    g.closePath();
    g.strokeStyle = rgba(0.42);
    g.lineWidth = 5;
    g.stroke();
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    const xw = (LON_B - LON_A) * SX,
      yh = LAT_B - LAT_A;
    t.repeat.set(1 / xw, 1 / yh);
    t.offset.set(-((LON_A - 82) * SX) / xw, -(LAT_A - 22) / yh);
    textures.push(t);
    return t;
  }

  const seaTex = canvasTex(512, 512, (g, w, hgt) => {
    const gr = g.createRadialGradient(w / 2, hgt / 2, 30, w / 2, hgt / 2, w * 0.52);
    gr.addColorStop(0, '#dbe7fa');
    gr.addColorStop(0.55, '#c6d8f4');
    gr.addColorStop(1, '#aec5ea');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hgt);
    g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    g.lineWidth = 1;
    for (let k = 0; k <= w; k += 32) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, hgt);
      g.stroke();
      g.beginPath();
      g.moveTo(0, k);
      g.lineTo(w, k);
      g.stroke();
    }
  });
  const sea = mk(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshBasicMaterial({ map: seaTex }),
    mapG,
    0,
    -0.02,
    0,
    false,
    false,
  );
  sea.rotation.x = -Math.PI / 2;
  const seaShadow = mk(
    new THREE.PlaneGeometry(120, 120),
    new THREE.ShadowMaterial({ opacity: 0.16 }),
    mapG,
    0,
    -0.01,
    0,
    false,
    true,
  );
  seaShadow.rotation.x = -Math.PI / 2;

  function buildLand(outline: LatLon[]) {
    const shape = new THREE.Shape();
    outline.forEach(([la, lo], i) =>
      i ? shape.lineTo((lo - 82) * SX, la - 22) : shape.moveTo((lo - 82) * SX, la - 22),
    );
    const landGeo = new THREE.ExtrudeGeometry(shape, {
      depth: TOP,
      bevelEnabled: false,
    });
    landGeo.rotateX(-Math.PI / 2);
    mat.landTop.map = landTex(outline);
    mat.landTop.needsUpdate = true;
    mk(landGeo, [mat.landTop, mat.landSide], mapG, 0, 0, 0, true, true);
    const rim = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outline.map(([la, lo]) => mp(la, lo, TOP + 0.014))),
      new THREE.LineBasicMaterial({ color: lin(BRAND), transparent: true, opacity: 0.55 }),
    );
    mapG.add(rim);
  }

  const flowTex = canvasTex(
    128,
    8,
    (g, w, hgt) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.62, 'rgba(255,255,255,0)');
      gr.addColorStop(0.8, 'rgba(255,255,255,1)');
      gr.addColorStop(0.9, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, hgt);
    },
    1,
    1,
  );

  const oPos = mp(ORIGIN.lat, ORIGIN.lon, TOP);
  box(0.8, 0.38, 0.65, mat.navy, mapG, oPos.x, TOP + 0.19, oPos.z);
  const rings = [0, 1].map(() => {
    const m = mk(
      new THREE.RingGeometry(0.45, 0.56, 48),
      fadeMat(ACCENT),
      mapG,
      oPos.x,
      TOP + 0.025,
      oPos.z,
      false,
      false,
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  });

  function miniTruck() {
    const g = new THREE.Group();
    box(0.3, 0.3, 0.95, mat.miniTrailer, g, 0, 0.24, -0.12);
    box(0.3, 0.32, 0.28, mat.cab, g, 0, 0.22, 0.52);
    box(0.32, 0.08, 1.35, mat.rubber, g, 0, 0.06, 0.05);
    g.scale.setScalar(1.35);
    g.visible = false;
    mapG.add(g);
    return g;
  }
  const SIDE = { left: 'l', right: 'r', top: 't', bottom: 'b' } as const;
  type Side = 'l' | 'r' | 't' | 'b' | 'c';
  const leadersSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leadersSvg.setAttribute('class', 'sc-leaders');
  leadersSvg.setAttribute('aria-hidden', 'true');
  labelsEl.append(leadersSvg);
  const mkLeader = () => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leadersSvg.append(l);
    return l;
  };

  const routes = DESTS.map((d, i) => {
    const ry = RY + i * 0.005;
    const end = mp(d.lat, d.lon, ry);
    const pts = corridors[i].map(([la, lo]) => mp(la, lo, ry));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const SEG = 200;
    mk(new THREE.TubeGeometry(curve, SEG, 0.032, 8, false), mat.track, mapG, 0, 0, 0, false, false);
    const core = mk(
      new THREE.TubeGeometry(curve, SEG, 0.048, 8, false),
      mat.route,
      mapG,
      0,
      0,
      0,
      false,
      false,
    );
    const ft = flowTex.clone();
    ft.needsUpdate = true;
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(Math.max(2, Math.round(len * 0.45)), 1);
    textures.push(ft);
    const flow = mk(
      new THREE.TubeGeometry(curve, SEG, 0.064, 8, false),
      new THREE.MeshBasicMaterial({ map: ft, color: lin(ACCENT), transparent: true, depthWrite: false }),
      mapG,
      0,
      0,
      0,
      false,
      false,
    );
    const tubes = [core, flow];
    const count = core.geometry.index?.count ?? 0;
    tubes.forEach((t) => t.geometry.setDrawRange(0, 0));
    mk(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28), mat.disk, mapG, end.x, TOP + 0.025, end.z);
    const pin = new THREE.Group();
    pin.position.set(end.x, TOP, end.z);
    mk(new THREE.CylinderGeometry(0.028, 0.028, 0.72, 8), mat.pin, pin, 0, 0.36, 0);
    mk(new THREE.SphereGeometry(0.155, 20, 16), mat.pin, pin, 0, 0.76, 0);
    pin.scale.setScalar(0.001);
    mapG.add(pin);
    const halo = mk(
      new THREE.RingGeometry(0.26, 0.35, 48),
      fadeMat(BRAND),
      mapG,
      end.x,
      TOP + 0.04,
      end.z,
      false,
      false,
    );
    halo.rotation.x = -Math.PI / 2;
    const lbl = h('span', { class: 'sc-lbl show' }, d.city);
    labelsEl.append(lbl);
    const side: Side = SIDE[d.labelSide];
    return {
      d,
      curve,
      tubes,
      count,
      pin,
      halo,
      flowTex: ft,
      truck: miniTruck(),
      lbl,
      leader: mkLeader(),
      side,
      anchor: new THREE.Vector3(end.x, TOP + (side === 't' ? 0.96 : 0.76), end.z),
      u: 0,
      state: 'wait' as 'wait' | 'road' | 'done',
    };
  });
  type Route = (typeof routes)[number];
  const originLbl = h(
    'span',
    { class: 'sc-lbl origin' },
    h('img', { src: content.site.logo, alt: content.site.name }),
    ORIGIN.mapLabel,
  );
  labelsEl.append(originLbl);
  const originLeader = mkLeader();
  const originAnchor = new THREE.Vector3(oPos.x, TOP + 0.65, oPos.z);
  const regionEls = sc.regions.map((r) => {
    const e = h('span', { class: 'sc-region' }, r.label);
    labelsEl.append(e);
    return { e, v: mp(r.lat, r.lon, TOP + 0.1) };
  });
  labelsEl.hidden = true;

  const mapBg = canvasTex(16, 256, (g, w, hgt) => {
    const gr = g.createLinearGradient(0, 0, 0, hgt);
    gr.addColorStop(0, '#eef4fd');
    gr.addColorStop(1, '#d5e2f7');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hgt);
  });

  // The outline is a media file; the map is finished once it arrives.
  const outlineReady = loadOutline(sc.mapOutline)
    .then((o) => {
      if (alive && o.length > 2) buildLand(o);
    })
    .catch(() => {});

  /* ===== Loop, tweens and camera ===== */
  type Tween = { t0: number; ms: number; fn: (t: number) => void; res: () => void };
  const tweens: Tween[] = [];
  let clock = 0,
    lastReal = 0,
    lastFrame = 0;
  const tween = (ms: number, fn: (t: number) => void) =>
    new Promise<void>((res) => tweens.push({ t0: clock, ms: Math.max(1, ms), fn, res }));
  const wait = (ms: number) => tween(ms, () => {});
  let mode: 'dock' | 'map' = 'dock';
  const orbit = { a: 0.15, r: 19, h: 7, tx: -1, ty: 2, tz: 1 };
  const MC = new THREE.Vector3(0.8, 0, -0.8);
  const cam = { R: 72, phi: 0.12, th: 0 };
  function mapCamPos() {
    const R = cam.R * (camera.aspect < 1.3 ? 1.25 : 1),
      sn = Math.sin(cam.phi);
    camera.position.set(
      MC.x + R * sn * Math.sin(cam.th),
      R * Math.cos(cam.phi),
      MC.z + R * sn * Math.cos(cam.th),
    );
    camera.lookAt(MC);
  }
  const proj = new THREE.Vector3();
  function placeRegion(el: HTMLElement, v: THREE.Vector3) {
    proj.copy(v).project(camera);
    const w = stage.clientWidth,
      hgt = stage.clientHeight;
    el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * hgt}px) translate(-50%, -50%)`;
    el.style.visibility = proj.z < 1 ? 'visible' : 'hidden';
  }
  type LabelBox = {
    el: HTMLElement;
    leader: SVGLineElement;
    px: number;
    py: number;
    x: number;
    y: number;
    bw: number;
    bh: number;
    ok: boolean;
  };
  function layoutLabels() {
    const w = stage.clientWidth,
      hgt = stage.clientHeight;
    if (!w || !hgt) return;
    const minX = 10,
      maxX = w - 10,
      minY = 48,
      maxY = hgt - 68;
    const items: { el: HTMLElement; leader: SVGLineElement; v: THREE.Vector3; side: Side }[] = [
      { el: originLbl, leader: originLeader, v: originAnchor, side: 't' },
      ...routes.map((r) => ({ el: r.lbl, leader: r.leader, v: r.anchor, side: r.side })),
    ];
    const boxes: LabelBox[] = items.map(({ el, leader, v, side }) => {
      proj.copy(v).project(camera);
      const ok = proj.z < 1;
      const px = ((proj.x + 1) / 2) * w;
      const py = ((1 - proj.y) / 2) * hgt;
      const bw = el.offsetWidth || 80;
      const bh = el.offsetHeight || 26;
      const gap = 12;
      let x = px - bw / 2;
      let y = py - bh / 2;
      if (side === 'l') x = px - bw - gap;
      else if (side === 'r') x = px + gap;
      else if (side === 't') y = py - bh - 10;
      else if (side === 'b') y = py + 12;
      x = Math.max(minX, Math.min(maxX - bw, x));
      y = Math.max(minY, Math.min(maxY - bh, y));
      return { el, leader, px, py, x, y, bw, bh, ok };
    });
    // Resolve any 2D screen-space overlaps between label cards.
    const pad = 6;
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          if (!a.ok || !b.ok) continue;
          const ox = Math.min(a.x + a.bw, b.x + b.bw) + pad - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.bh, b.y + b.bh) + pad - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0) {
            if (oy <= ox) {
              const s = (a.y + a.bh / 2 <= b.y + b.bh / 2 ? -1 : 1) * (oy / 2);
              a.y += s;
              b.y -= s;
            } else {
              const s = (a.x + a.bw / 2 <= b.x + b.bw / 2 ? -1 : 1) * (ox / 2);
              a.x += s;
              b.x -= s;
            }
            a.x = Math.max(minX, Math.min(maxX - a.bw, a.x));
            a.y = Math.max(minY, Math.min(maxY - a.bh, a.y));
            b.x = Math.max(minX, Math.min(maxX - b.bw, b.x));
            b.y = Math.max(minY, Math.min(maxY - b.bh, b.y));
          }
        }
      }
    }
    boxes.forEach((b) => {
      b.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px)`;
      b.el.style.visibility = b.ok ? 'visible' : 'hidden';
      if (!b.ok) {
        b.leader.style.visibility = 'hidden';
        return;
      }
      const cx = Math.max(b.x, Math.min(b.x + b.bw, b.px));
      const cy = Math.max(b.y, Math.min(b.y + b.bh, b.py));
      const dist = Math.hypot(cx - b.px, cy - b.py);
      b.leader.style.visibility = dist > 4 ? 'visible' : 'hidden';
      b.leader.setAttribute('x1', b.px.toFixed(1));
      b.leader.setAttribute('y1', b.py.toFixed(1));
      b.leader.setAttribute('x2', cx.toFixed(1));
      b.leader.setAttribute('y2', cy.toFixed(1));
    });
  }
  let raf = 0;
  function frame(now: number) {
    if (!alive) return;
    const realDt = lastReal ? Math.min(100, now - lastReal) : 0;
    lastReal = now;
    if (!S.paused) clock += realDt * (CH[S.ch].speed ?? 1);
    const active = tweens.splice(0);
    for (const tw of active) {
      const t = clamp01((clock - tw.t0) / tw.ms);
      tw.fn(t);
      if (t < 1) tweens.push(tw);
      else tw.res();
    }
    if (mode === 'dock') {
      camera.position.set(
        orbit.tx + orbit.r * Math.sin(orbit.a),
        orbit.h,
        orbit.tz + orbit.r * Math.cos(orbit.a),
      );
      camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
    } else {
      const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
      mapCamPos();
      if (!reduce) {
        rings.forEach((r, i) => {
          const p = (now / 2400 + i * 0.5) % 1;
          r.scale.setScalar(1 + p * 2.6);
          (r.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - p);
        });
        routes.forEach((r) => {
          r.flowTex.offset.x -= dt * 0.7;
        });
      }
      layoutLabels();
      regionEls.forEach((r) => placeRegion(r.e, r.v));
    }
    lastFrame = now;
    updatePanel();
    R3.render(world, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  /* ===== Choreography ===== */
  const TS = 0.55;
  const dur = (m: number) => TS * (420 + (m / 4) * 1000);
  const yawOf = (dx: number, dz: number) => Math.atan2(-dz, dx);
  function driveStraight(ms: number, tx: number, tz: number, rev: boolean) {
    const sx = fk.x,
      sz = fk.z;
    fk.rev = rev;
    return tween(ms, (t) => {
      const e = ease(t);
      fk.x = sx + (tx - sx) * e;
      fk.z = sz + (tz - sz) * e;
      applyFork();
    });
  }
  function driveCurve(ms: number, cx: number, cz: number, tx: number, tz: number, rev: boolean) {
    const sx = fk.x,
      sz = fk.z;
    fk.rev = rev;
    return tween(ms, (t) => {
      const u = ease(t),
        iu = 1 - u;
      fk.x = iu * iu * sx + 2 * iu * u * cx + u * u * tx;
      fk.z = iu * iu * sz + 2 * iu * u * cz + u * u * tz;
      const dx = 2 * iu * (cx - sx) + 2 * u * (tx - cx),
        dz = 2 * iu * (cz - sz) + 2 * u * (tz - cz);
      if (Math.hypot(dx, dz) > 1e-4) fk.yaw = rev ? yawOf(-dx, -dz) : yawOf(dx, dz);
      applyFork();
    });
  }
  const lift = (ms: number, to: number) => {
    const s = fk.fh;
    return tween(ms, (t) => {
      fk.fh = s + (to - s) * ease(t);
      applyFork();
    });
  };

  async function trip(k: number) {
    const px = PX[k],
      [sx, sz] = SLOTS[k],
      p = staged[k];
    await driveStraight(dur(1.25), px, PZ - 1.45, false);
    forklift.car.attach(p);
    await lift(TS * 480, FH_HIGH);
    await driveCurve(TS * 1600, px, sz, px - 1.9, sz, true);
    await driveStraight(dur(Math.abs(sx - 1.45 - fk.x)), sx - 1.45, sz, false);
    await lift(TS * 480, FH_LOW);
    truck.attach(p);
    loaded++;
    updateMeter();
    if (k < PX.length - 1) {
      const nx = PX[k + 1];
      await driveStraight(dur(Math.abs(fk.x - (nx - 1.9))), nx - 1.9, sz, true);
      await driveCurve(TS * 1500, nx, sz, nx, 2.5, false);
    } else {
      await driveStraight(dur(5), -6.6, sz, true);
    }
  }
  function moveTruck(x: number) {
    const dx = x - truck.position.x;
    truck.position.x = x;
    truckWheels.forEach((w) => (w.rotation.z -= dx / 0.52));
  }
  function showMap() {
    mode = 'map';
    dockG.visible = false;
    mapG.visible = true;
    world.fog = new THREE.Fog(0xd5e2f7, 72, 140);
    world.background = mapBg;
    R3.toneMappingExposure = 1.0;
    sun.position.set(-14, 38, 16);
    sun.target.position.set(0, 0, 0);
    sun.intensity = 0.72;
    sun.color.set(0xffffff);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26 });
    sun.shadow.camera.updateProjectionMatrix();
    hemi.color.set(0xffffff);
    hemi.groundColor.set(0xb8c6e0);
    hemi.intensity = 0.88;
    labelsEl.hidden = false;
    loadMeter.hidden = true;
    loadedTag.classList.remove('show');
    caption.textContent = CH[Math.min(2, LAST)].caption;
  }
  function placeMini(r: Route, u: number) {
    const pos = r.curve.getPointAt(u);
    const tan = r.curve.getTangentAt(u);
    r.truck.position.copy(pos);
    r.truck.lookAt(pos.x + tan.x, pos.y + tan.y, pos.z + tan.z);
  }
  const doneLabel = (r: Route) => {
    r.lbl.classList.add('done');
    r.lbl.replaceChildren(r.d.city, h('small', {}, `✓ ${L.delivered} · ${fmtKm(r.d.km)} ${L.km}`));
  };
  function arrive(r: Route) {
    void tween(650, (t) => r.pin.scale.setScalar(0.001 + (1 - Math.pow(1 - t, 3))));
    void tween(1500, (t) => {
      r.halo.scale.setScalar(1 + t * 4);
      (r.halo.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - t);
    });
    doneLabel(r);
    void tween(700, (t) => r.truck.scale.setScalar(1.35 * (1 - t) + 0.001)).then(
      () => (r.truck.visible = false),
    );
  }
  function setRoute(r: Route, u: number, state: Route['state']) {
    r.u = u;
    r.state = state;
    const n = u >= 1 ? Infinity : Math.floor((u * r.count) / 6) * 6;
    r.tubes.forEach((tb) => tb.geometry.setDrawRange(0, n));
  }
  function resetRoute(r: Route) {
    setRoute(r, 0, 'wait');
    r.truck.visible = false;
    r.truck.scale.setScalar(1.35);
    r.pin.scale.setScalar(0.001);
    (r.halo.material as THREE.MeshBasicMaterial).opacity = 0;
    r.lbl.classList.remove('done');
    r.lbl.textContent = r.d.city;
  }
  function doneRoute(r: Route) {
    setRoute(r, 1, 'done');
    r.truck.visible = false;
    r.pin.scale.setScalar(1);
    doneLabel(r);
  }
  const FULLCAM = { c: [20.4, 82.4] as LatLon, R: 47, phi: 0.5, th: 0.06 };
  function camTo(c: LatLon, R: number, phi: number, th: number, ms: number, ok: () => boolean) {
    const s0 = { x: MC.x, z: MC.z, R: cam.R, phi: cam.phi, th: cam.th };
    const tgt = mp(c[0], c[1], 0);
    if (reduce || ms <= 0) {
      MC.set(tgt.x, 0, tgt.z);
      cam.R = R;
      cam.phi = phi;
      cam.th = th;
      return Promise.resolve();
    }
    return tween(ms, (t) => {
      if (!ok()) return;
      const e = ease(t);
      MC.set(s0.x + (tgt.x - s0.x) * e, 0, s0.z + (tgt.z - s0.z) * e);
      cam.R = s0.R + (R - s0.R) * e;
      cam.phi = s0.phi + (phi - s0.phi) * e;
      cam.th = s0.th + (th - s0.th) * e;
    });
  }
  function showMapFinal() {
    routes.forEach(doneRoute);
    void camTo(FULLCAM.c, FULLCAM.R, FULLCAM.phi, FULLCAM.th, 0, () => true);
    regionEls.forEach((r) => r.e.classList.add('show'));
    setChapterUI(LAST);
    S.prog = 1;
  }
  let chapRun = 0;
  async function runChapter(i: number, fromDock: boolean) {
    const my = ++chapRun;
    const ok = () => alive && my === chapRun;
    chapterDone = false;
    if (mode !== 'map') {
      showMap();
      fader.classList.remove('on');
    }
    setChapterUI(i);
    regionEls.forEach((r) => r.e.classList.toggle('show', i === LAST));
    routes.forEach((r) => (i === LAST || chOf[r.d.city] < i ? doneRoute(r) : resetRoute(r)));
    if (i === LAST) {
      await camTo(FULLCAM.c, FULLCAM.R, FULLCAM.phi, FULLCAM.th, 2200, ok);
      if (ok()) {
        S.prog = 1;
        chapterDone = true;
      }
      return;
    }
    const c = CH[i];
    const cm = c.camera ?? { lat: FULLCAM.c[0], lon: FULLCAM.c[1], distance: FULLCAM.R, turn: FULLCAM.th };
    await camTo([cm.lat, cm.lon], cm.distance, 0.54, cm.turn, fromDock ? 3000 : 1600, ok);
    if (!ok()) return;
    const list = routes.filter((r) => chOf[r.d.city] === i);
    await Promise.all(
      list.map(async (r, j) => {
        await wait(j * 450);
        if (!ok()) return;
        if (reduce) {
          doneRoute(r);
          return;
        }
        r.state = 'road';
        r.truck.visible = true;
        r.truck.scale.setScalar(1.35);
        await tween(2400 + r.d.km * 1.9, (t) => {
          if (!ok()) return;
          const u = ease(t);
          placeMini(r, u);
          setRoute(r, u, 'road');
        });
        if (!ok()) return;
        setRoute(r, 1, 'done');
        arrive(r);
      }),
    );
    if (!ok()) return;
    chapterDone = true;
    await wait(1500);
    if (!ok()) return;
    if (S.auto) void runChapter(i + 1, false);
  }
  function updatePanel() {
    let prog = S.prog;
    const kind = CH[S.ch].kind;
    if (S.ch === 0) prog = (loaded - 17) / 3;
    if (kind === 'loading' || kind === 'dispatch') {
      if (refs.lv && refs.lm && refs.ls && refs.lst) {
        const f = loaded / TOTAL;
        refs.lv.textContent = `${Math.round(f * 100)}%`;
        refs.lm.style.width = `${(f * 100).toFixed(1)}%`;
        refs.ls.textContent = String(TOTAL - loaded);
        refs.lst.textContent = S.status;
        refs.lst.classList.toggle('ok', S.status !== L.statusLoading);
      }
    } else if (kind === 'region') {
      const list = routes.filter((r) => chOf[r.d.city] === S.ch);
      prog = list.reduce((a, r) => a + (r.u || 0), 0) / (list.length || 1);
      if (refs.ld && refs.lr && refs.lk) {
        refs.ld.textContent = String(routes.filter((r) => r.state === 'done').length);
        refs.lr.textContent = String(routes.filter((r) => r.state === 'road').length);
        refs.lk.textContent = fmtKm(routes.reduce((a, r) => a + r.d.km * (r.u || 0), 0));
      }
    }
    railItems.forEach((r, k) => {
      const f = k < S.ch ? 1 : k > S.ch ? 0 : clamp01(prog);
      r.fill.style.transform = `scaleX(${f.toFixed(3)})`;
    });
  }

  async function play() {
    await outlineReady;
    if (!alive) return;
    mapReady = true;
    routes.forEach(resetRoute);
    if (reduce) {
      showMap();
      showMapFinal();
      return;
    }
    const ok = () => alive && !S.skipped;
    await wait(700);
    if (!ok()) return;
    void tween(15500, (t) => {
      if (ok()) orbit.a = 0.15 + 0.75 * ease(t);
    });
    for (let k = 0; k < PX.length; k++) {
      await trip(k);
      if (!ok()) return;
    }
    setChapterUI(1);
    S.status = L.statusSealed;
    const x0 = truck.position.x;
    await tween(1700, (t) => {
      if (!ok()) return;
      moveTruck(x0 + 2.6 * ease(t));
      S.prog = 0.2 * t;
    });
    await tween(1600, (t) => {
      if (!ok()) return;
      setDoors(1 - ease(t));
      S.prog = 0.2 + 0.2 * t;
    });
    if (!ok()) return;
    loadedTag.classList.add('show');
    await wait(700);
    if (!ok()) return;
    S.status = L.statusDeparted;
    const x1 = truck.position.x;
    const o0 = { tx: orbit.tx, h: orbit.h, a: orbit.a };
    await tween(4800, (t) => {
      if (!ok()) return;
      const x = x1 + 75 * t * t;
      moveTruck(x);
      orbit.tx = o0.tx + (x - x1) * 0.35;
      orbit.a = o0.a + 0.25 * t;
      const rise = Math.max(0, (t - 0.45) / 0.55);
      orbit.h = o0.h + 30 * rise * rise;
      S.prog = 0.4 + 0.6 * t;
      if (t > 0.72) fader.classList.add('on');
    });
    if (!ok()) return;
    await wait(400);
    if (!ok()) return;
    void runChapter(2, true);
  }

  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        if (alive) void play();
      }
    },
    { threshold: 0.3 },
  );
  io.observe(stage);
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as Element | null;
    if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      goChapter(S.ch + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      goChapter(S.ch - 1);
    } else if (e.key === 'p' || e.key === 'P') {
      S.paused = !S.paused;
      syncPlay();
    }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    io.disconnect();
    document.removeEventListener('keydown', onKey);
    ro.disconnect();
    tweens.splice(0).forEach((tw) => tw.res());
    world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) ([] as THREE.Material[]).concat(m.material).forEach((x) => x.dispose());
    });
    textures.forEach((t) => t.dispose());
    R3.dispose();
    R3.forceContextLoss();
    R3.domElement.remove();
  };
}
