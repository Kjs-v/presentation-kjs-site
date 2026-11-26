/**
 * The Marico film: animated 16:9 scenes drawn on a canvas (1600 × 900 drawing units, scaled to fit).
 * Loaded on demand by src/pages/marico.ts once the PIN is entered.
 * Each scene `kind` in content.marico.scenes has a draw function here; every word and number comes from content.
 * `painter()` is shared by the live player and the PDF / PowerPoint export (which draws each scene's last frame).
 */
import type { Content, FilmScene } from '../../content/content.schema';

export const W = 1600;
export const H = 900;

/** The film's own look: always dark, whatever site theme is chosen, because it is projected. */
const C = {
  text: '#eef1f8',
  muted: '#9aa6c2',
  amber: '#f4b952',
  amber2: '#ffd58a',
  card: '#16213a',
  belt: '#1c2b50',
  line: '#2f4373',
  blue: '#6f9bff',
  green: '#4cc38a',
  ink: '#0a1226',
};

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t: number, s: number, d: number) => clamp((t - s) / d);
const eo = (x: number) => 1 - Math.pow(1 - x, 3);
export const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
type Pt = [number, number];
const cubic = (p: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const f = (i: 0 | 1) =>
    u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i];
  return [f(0), f(1)];
};

/** Images and the India outline the film needs. */
export type Assets = {
  kjs?: HTMLImageElement;
  kjsDark?: HTMLImageElement;
  partnerLogo?: HTMLImageElement;
  logos: Map<string, HTMLImageElement>;
  products: { name: string; image: HTMLImageElement }[];
  india?: Path2D;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });

/** Loads every picture the film draws. `withProducts` also loads the best-seller cut-outs (for the export). */
export async function loadAssets(content: Content, withProducts: boolean): Promise<Assets> {
  const names = new Set(
    content.marico.scenes.flatMap((s) => (s.kind === 'clients' ? [...s.first, ...s.more] : [])),
  );
  const partners = content.site.partners.filter((p) => names.has(p.name));
  const handover = content.marico.scenes.find((s) => s.kind === 'handover');
  const featured = withProducts ? featuredProducts(content) : [];
  const [kjs, kjsDark, partnerLogo, logos, products, india] = await Promise.all([
    loadImage(content.site.logo),
    loadImage(content.site.logoOnLight),
    handover?.kind === 'handover' && handover.partnerLogo ? loadImage(handover.partnerLogo) : undefined,
    Promise.all(partners.map(async (p) => [p.name, await loadImage(p.logo)] as const)),
    Promise.all(featured.map(async (p) => ({ name: p.name, image: await loadImage(p.image) }))),
    fetch(content.supplyChain.mapOutline)
      .then((r) => r.text())
      .then((svg) => new Path2D(svg.match(/\sd="([^"]+)"/)?.[1] ?? ''))
      .catch(() => undefined),
  ]);
  return {
    kjs,
    kjsDark,
    partnerLogo,
    logos: new Map(logos.filter((l): l is readonly [string, HTMLImageElement] => !!l[1])),
    products: products.filter((p): p is { name: string; image: HTMLImageElement } => !!p.image),
    india,
  };
}

/** The best sellers (same list as the turning packs in Gallery → Products). */
export function featuredProducts(content: Content) {
  return content.products
    .filter((p) => p.featured)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ id: p.id, name: p.name, image: p.featuredImage ?? p.image }));
}

export type Painter = {
  /** Draws the background (T = running time, for the drifting dust). */
  background(T: number): void;
  /** Draws scene `i` at `t` seconds into it, faded by `alpha`. */
  scene(i: number, t: number, alpha: number): void;
  /** Draws a scene's caption onto the canvas (only for the export; live captions are HTML). */
  caption(s: FilmScene): void;
};

export function painter(
  ctx: CanvasRenderingContext2D,
  content: Content,
  assets: Assets,
  opts: { still?: boolean } = {},
): Painter {
  const HEAD = content.site.theme.fontHeading;
  const BODY = content.site.theme.fontBody;
  const sc = content.supplyChain;
  let SA = 1;
  const ga = (a = 1) => {
    ctx.globalAlpha = SA * clamp(a);
  };
  const spacing = (px: number) => {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
  };
  const rr = (x: number, y: number, w: number, h: number, r: number | number[]) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  const circle = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  };
  type TextOpts = {
    w?: number;
    c?: string;
    a?: number;
    al?: CanvasTextAlign;
    head?: boolean;
    ls?: number;
    outline?: boolean;
  };
  const text = (s: string, x: number, y: number, size: number, o: TextOpts = {}) => {
    ga(o.a ?? 1);
    ctx.font = `${o.w ?? 600} ${size}px ${o.head ? HEAD : BODY}`;
    ctx.fillStyle = o.c ?? C.text;
    ctx.textAlign = o.al ?? 'left';
    ctx.textBaseline = 'alphabetic';
    spacing(o.ls ?? 0);
    if (o.outline) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.ink;
      ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y);
    }
    ctx.fillText(s, x, y);
    const width = ctx.measureText(s).width;
    spacing(0);
    return width;
  };
  const img = (im: HTMLImageElement | undefined, cx: number, cy: number, mw: number, mh: number, a = 1) => {
    if (!im || !im.naturalWidth || mw <= 0 || mh <= 0) return;
    const k = Math.min(mw / im.naturalWidth, mh / im.naturalHeight);
    const w = im.naturalWidth * k,
      h = im.naturalHeight * k;
    ga(a);
    ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  };
  const count = (n: number, p: number) => Math.round(n * eo(p)).toLocaleString('en-IN');
  const header = (x: number, y: number, num: string, label: string, a: number) => {
    const w = text(num, x, y, 46, { w: 900, head: true, c: C.amber, a });
    text(label, x + w + 14, y, 24, { c: C.muted, a });
  };
  const strokeCubic = (P: [Pt, Pt, Pt, Pt], p: number, color: string, lw: number) => {
    if (p <= 0) return;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const q = cubic(P, (i / 60) * p);
      if (i) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  const carton = (x: number, y: number, s = 1, a = 1) => {
    ga(a);
    ctx.fillStyle = C.amber;
    rr(x - 17 * s, y - 13 * s, 34 * s, 26 * s, 3 * s);
    ctx.fill();
    ctx.fillStyle = '#c98b2a';
    ctx.fillRect(x - 3 * s, y - 13 * s, 6 * s, 26 * s);
  };
  const fade = (f: number, k = 6) => Math.min(1, f * k, (1 - f) * k);

  /* ---------- Background ---------- */
  const dust = Array.from({ length: 80 }, (_, i) => ({
    x: (i * 211) % W,
    y: (i * 137) % H,
    r: 0.4 + ((i * 7) % 16) / 10,
    s: 4 + ((i * 13) % 10),
    p: i,
  }));
  const background = (T: number) => {
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(W * 0.55, H * 0.35, 40, W * 0.5, H * 0.5, W * 0.8);
    g.addColorStop(0, '#182a52');
    g.addColorStop(1, '#070d1e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(130,160,230,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 80) (ctx.moveTo(x, 0), ctx.lineTo(x, H));
    for (let y = 0; y <= H; y += 80) (ctx.moveTo(0, y), ctx.lineTo(W, y));
    ctx.stroke();
    dust.forEach((d) => {
      let y = (d.y - T * d.s) % H;
      if (y < 0) y += H;
      ctx.globalAlpha = 0.18 + 0.18 * Math.sin(T + d.p);
      ctx.fillStyle = C.amber2;
      circle(d.x, y, d.r);
      ctx.fill();
    });
  };

  /* ---------- Machines, icons, vehicles ---------- */
  const ballMill = (x: number, y: number, r: number, t: number) => {
    ga(1);
    ctx.fillStyle = '#22345f';
    rr(x - r * 0.9, y + r * 0.9, r * 1.8, 8, 3);
    ctx.fill();
    ctx.fillStyle = C.belt;
    circle(x, y, r);
    ctx.fill();
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 2.6);
    ctx.strokeStyle = C.amber2;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.amber;
    circle(x, y, 3.5);
    ctx.fill();
  };
  const tank = (x: number, y: number, p: number, t: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(p, p);
    ga(1);
    ctx.fillStyle = '#22345f';
    rr(-14, -76, 28, 18, 4);
    ctx.fill();
    rr(-36, -52, 72, 94, [8, 8, 28, 28]);
    ctx.fillStyle = C.belt;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(-40, 60);
    for (let i = -40; i <= 40; i += 4) ctx.lineTo(i, -4 + Math.sin(i / 9 + t * 4) * 4);
    ctx.lineTo(40, 60);
    ctx.closePath();
    ga(0.45);
    ctx.fillStyle = C.amber;
    ctx.fill();
    ctx.restore();
    ga(1);
    rr(-36, -52, 72, 94, [8, 8, 28, 28]);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = C.text;
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(0, 22);
    ctx.stroke();
    const bw = 24 * Math.cos(t * 5);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-bw, 22);
    ctx.lineTo(bw, 22);
    ctx.moveTo(-bw * 0.8, 6);
    ctx.lineTo(bw * 0.8, 6);
    ctx.stroke();
    ctx.restore();
  };
  const vBlender = (x: number, y: number, p: number, t: number) => {
    ga(1);
    ctx.strokeStyle = '#3b5087';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 22, y + 24);
    ctx.lineTo(x, y - 18);
    ctx.lineTo(x + 22, y + 24);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y - 18);
    ctx.scale(p, p);
    ctx.rotate(Math.sin(t * 2.2) * 0.9);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-17, -24);
    ctx.lineTo(0, 12);
    ctx.lineTo(17, -24);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.text;
    circle(x, y - 18, 3);
    ctx.fill();
  };
  const star = (x: number, y: number, s: number, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = C.amber2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 3 : 10,
        an = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
    }
    ctx.fill();
    ctx.restore();
  };
  const ICON: Record<'coffee' | 'nutrition' | 'confectionery' | 'dry' | 'wet', (t: number) => void> = {
    coffee(t) {
      ga(1);
      ctx.fillStyle = '#2a3d6b';
      ctx.beginPath();
      ctx.ellipse(0, 44, 52, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-38, -12);
      ctx.lineTo(38, -12);
      ctx.lineTo(29, 40);
      ctx.lineTo(-29, 40);
      ctx.closePath();
      ctx.fillStyle = '#f2e6d3';
      ctx.fill();
      ctx.fillStyle = '#6b4423';
      ctx.beginPath();
      ctx.ellipse(0, -12, 38, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2e6d3';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(38, 12, 14, -1.2, 1.3);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.text;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.7 + k / 3) % 1;
        ga((1 - ph) * 0.8 * Math.min(1, ph * 5));
        ctx.beginPath();
        for (let s = 0; s <= 10; s++) {
          const yy = -24 - s * 4 - ph * 22,
            xx = (k - 1) * 16 + Math.sin(s * 0.7 + t * 3 + k) * 5;
          if (s) ctx.lineTo(xx, yy);
          else ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
    },
    nutrition(t) {
      ga(1);
      ctx.fillStyle = '#4d78d6';
      rr(-32, -42, 64, 86, 8);
      ctx.fill();
      ctx.fillStyle = '#86a9f5';
      ctx.beginPath();
      ctx.ellipse(0, -42, 32, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      rr(-32, -10, 64, 28, 2);
      ctx.fill();
      ctx.fillStyle = C.green;
      ctx.fillRect(-3, -6, 6, 20);
      ctx.fillRect(-10, 1, 20, 6);
      const spots: Pt[] = [
        [-52, -40],
        [50, -20],
        [44, 38],
      ];
      spots.forEach(([sx, sy], k) => {
        const ph = (t * 0.9 + k / 3) % 1,
          a = Math.sin(ph * Math.PI);
        ga(a);
        star(sx, sy, a, ph * 2);
      });
    },
    confectionery(t) {
      ctx.save();
      ctx.rotate(Math.sin(t * 2) * 0.25);
      ga(1);
      ctx.fillStyle = '#ffb9c6';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(34 * s, 0);
        ctx.lineTo(58 * s, -20);
        ctx.lineTo(54 * s, 0);
        ctx.lineTo(58 * s, 20);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#ff6f8e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 38, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 6;
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(k * 16 - 20, -30);
        ctx.lineTo(k * 16 + 20, 30);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    },
    dry(t) {
      for (let k = 0; k < 10; k++) {
        const ph = (t * 0.8 + k / 10) % 1;
        ga(1 - ph);
        ctx.fillStyle = '#f2e3b8';
        circle(((k * 37) % 20) - 10, -78 + ph * 44, 2.6);
        ctx.fill();
      }
      ga(1);
      ctx.beginPath();
      ctx.moveTo(-30, -36);
      ctx.lineTo(30, -36);
      ctx.lineTo(38, 44);
      ctx.lineTo(-38, 44);
      ctx.closePath();
      ctx.fillStyle = '#e9d8a6';
      ctx.fill();
      ctx.fillStyle = '#c4ad6e';
      ctx.fillRect(-30, -40, 60, 8);
      ctx.fillStyle = C.card;
      circle(0, 8, 15);
      ctx.fill();
      ctx.fillStyle = C.amber;
      circle(0, 8, 9);
      ctx.fill();
    },
    wet(t) {
      ga(1);
      rr(-34, -36, 68, 82, 14);
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(-40, 60);
      for (let i = -40; i <= 40; i += 3) ctx.lineTo(i, Math.sin(i / 10 + t * 3.2) * 5);
      ctx.lineTo(40, 60);
      ctx.closePath();
      ctx.fillStyle = '#3fb7b7';
      ctx.fill();
      ctx.restore();
      rr(-34, -36, 68, 82, 14);
      ctx.strokeStyle = '#bfe8ff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = C.amber;
      rr(-28, -50, 56, 14, 4);
      ctx.fill();
    },
  };
  const truck = (x: number, y: number, s: number, a: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ga(a);
    ctx.fillStyle = C.amber;
    rr(-44, -30, 62, 36, 4);
    ctx.fill();
    ctx.fillStyle = '#dfe6f5';
    rr(20, -22, 26, 28, [3, 8, 3, 3]);
    ctx.fill();
    ctx.fillStyle = C.card;
    rr(30, -18, 12, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#0b1328';
    for (const wx of [-30, -6, 34]) (circle(wx, 8, 7), ctx.fill());
    ctx.font = `900 13px ${HEAD}`;
    ctx.fillStyle = C.card;
    ctx.textAlign = 'center';
    ctx.fillText('KJS', -13, -7);
    ctx.restore();
  };
  const packShape: Record<'stick' | 'bar' | 'jar' | 'tin' | 'bulk', { h: number; draw: () => void }> = {
    stick: {
      h: 100,
      draw() {
        ctx.fillStyle = C.amber;
        rr(-12, -100, 24, 100, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-12, -84, 24, 10);
      },
    },
    bar: {
      h: 46,
      draw() {
        ctx.fillStyle = '#7a3f22';
        ctx.beginPath();
        ctx.moveTo(-66, -46);
        for (let k = 0; k <= 6; k++) ctx.lineTo(k % 2 ? -72 : -66, -46 + k * 7.7);
        ctx.lineTo(66, 0);
        for (let k = 0; k <= 6; k++) ctx.lineTo(k % 2 ? 72 : 66, -k * 7.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.amber;
        ctx.fillRect(-58, -34, 116, 22);
        ctx.fillStyle = '#7a3f22';
        for (let k = 0; k < 5; k++) ctx.fillRect(-50 + k * 22, -30, 14, 14);
      },
    },
    jar: {
      h: 122,
      draw() {
        ctx.fillStyle = '#2a3d6b';
        rr(-42, -106, 84, 106, 14);
        ctx.fill();
        ctx.strokeStyle = '#bfe8ff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#f2e6d3';
        ctx.fillRect(-42, -72, 84, 34);
        ctx.fillStyle = C.amber;
        rr(-34, -122, 68, 18, 5);
        ctx.fill();
      },
    },
    tin: {
      h: 160,
      draw() {
        ctx.fillStyle = '#c9d3ea';
        ctx.fillRect(-62, -150, 124, 150);
        ctx.fillStyle = '#e3e9f6';
        ctx.beginPath();
        ctx.ellipse(0, -150, 62, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.amber;
        ctx.fillRect(-62, -100, 124, 40);
        ctx.fillStyle = C.muted;
        ctx.beginPath();
        ctx.ellipse(0, 0, 62, 12, 0, 0, Math.PI);
        ctx.fill();
      },
    },
    bulk: {
      h: 236,
      draw() {
        ctx.fillStyle = '#e9d8a6';
        ctx.beginPath();
        ctx.moveTo(-80, -200);
        ctx.quadraticCurveTo(-100, -100, -92, 0);
        ctx.lineTo(92, 0);
        ctx.quadraticCurveTo(100, -100, 80, -200);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c4ad6e';
        ctx.beginPath();
        ctx.moveTo(-80, -200);
        ctx.lineTo(-30, -236);
        ctx.lineTo(30, -236);
        ctx.lineTo(80, -200);
        ctx.closePath();
        ctx.fill();
      },
    },
  };
  const weight = (g: number) =>
    g < 10
      ? `${parseFloat(g.toFixed(1))} g`
      : g < 1000
        ? `${Math.round(g)} g`
        : `${g < 10000 ? parseFloat((g / 1000).toFixed(1)) : Math.round(g / 1000)} kg`;

  /* ---------- India map ---------- */
  const MK = 19,
    MX = 690,
    MY = 52;
  const MP = (lat: number, lon: number): Pt => [MX + (lon - 68) * MK, MY + (37.2 - lat) * MK];
  const ORIGIN = MP(sc.origin.lat, sc.origin.lon);
  const CITIES = sc.destinations.map((d, i) => {
    const [x, y] = MP(d.lat, d.lon),
      [ox, oy] = ORIGIN,
      dx = x - ox,
      dy = y - oy,
      len = Math.hypot(dx, dy) || 1,
      b = 0.16 * len * (i % 2 ? 1 : -1);
    const c: Pt = [(ox + x) / 2 - (dy / len) * b, (oy + y) / 2 + (dx / len) * b];
    return { name: d.city, right: d.labelSide !== 'left', x, y, c };
  });
  const quad = (c: (typeof CITIES)[number], t: number): Pt => {
    const [ox, oy] = ORIGIN,
      u = 1 - t;
    return [u * u * ox + 2 * u * t * c.c[0] + t * t * c.x, u * u * oy + 2 * u * t * c.c[1] + t * t * c.y];
  };
  const quadD = (c: (typeof CITIES)[number], t: number): Pt => {
    const [ox, oy] = ORIGIN;
    return [
      2 * (1 - t) * (c.c[0] - ox) + 2 * t * (c.x - c.c[0]),
      2 * (1 - t) * (c.c[1] - oy) + 2 * t * (c.y - c.c[1]),
    ];
  };

  /* ---------- Scenes ---------- */
  const draw: { [K in FilmScene['kind']]: (s: Extract<FilmScene, { kind: K }>, t: number) => void } = {
    title(s, t) {
      for (let i = 0; i < 36; i++) {
        const an = (i / 36) * Math.PI * 2 + t * 0.12;
        ga((0.2 + 0.2 * Math.sin(t * 2 + i)) * prog(t, 0, 1));
        ctx.fillStyle = C.amber;
        circle(W / 2 + Math.cos(an) * 640, 440 + Math.sin(an) * 330, 2.5);
        ctx.fill();
      }
      const a1 = eo(prog(t, 0.2, 1));
      img(assets.kjs, W / 2, 250 - 20 * (1 - a1), 400, 140, a1);
      const a2 = eo(prog(t, 0.9, 0.8));
      text(s.eyebrow.toUpperCase(), W / 2, 400 + 16 * (1 - a2), 26, {
        w: 800,
        c: C.amber,
        a: a2,
        al: 'center',
        ls: 7,
      });
      const a3 = eo(prog(t, 1.3, 0.9));
      text(s.headline, W / 2, 500 + 24 * (1 - a3), 88, { w: 900, head: true, a: a3, al: 'center' });
      const lw = 460 * eio(prog(t, 1.9, 1));
      ga(1);
      ctx.fillStyle = C.amber;
      ctx.fillRect(W / 2 - lw / 2, 540, lw, 4);
      const a4 = eo(prog(t, 2.5, 0.8));
      text(s.subtitle, W / 2, 610 + 12 * (1 - a4), 36, { w: 500, c: C.muted, a: a4, al: 'center' });
    },

    machinery(s, t) {
      const [lines, mills, mixers, blenders] = s.groups;
      const rows = Math.ceil(lines.count / 5),
        pitch = Math.min(56, 440 / rows);
      header(110, 122, count(lines.count, prog(t, 0.4, 2.2)), lines.label, prog(t, 0.2, 0.6));
      for (let i = 0; i < lines.count; i++) {
        const x = 110 + (i % 5) * 134,
          y = 160 + Math.floor(i / 5) * pitch,
          p = eo(prog(t, 0.4 + i * (2.2 / lines.count), 0.45));
        if (p <= 0) continue;
        ga(p);
        ctx.fillStyle = C.belt;
        rr(x, y, 118 * p, 18, 9);
        ctx.fill();
        ctx.strokeStyle = '#30457a';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (p >= 1)
          for (let k = 0; k < 2; k++) {
            const f = (t * 0.42 + k * 0.5 + i * 0.137) % 1;
            ga(fade(f, 8));
            ctx.fillStyle = C.amber;
            rr(x + 6 + f * 94, y + 4, 12, 10, 2);
            ctx.fill();
          }
      }
      ga(prog(t, 0.2, 0.6) * 0.7);
      ctx.fillStyle = C.line;
      ctx.fillRect(820, 110, 2, 500);
      header(880, 122, count(mills.count, prog(t, 2.2, 1)), mills.label, prog(t, 2, 0.5));
      const ms = Math.min(78, 620 / mills.count);
      for (let i = 0; i < mills.count; i++) {
        const p = back(prog(t, 2.2 + i * 0.12, 0.5));
        if (p > 0) ballMill(906 + i * ms, 200, Math.min(27, ms * 0.35) * p, t + i);
      }
      header(880, 300, count(mixers.count, prog(t, 3.4, 0.8)), mixers.label, prog(t, 3.2, 0.5));
      const xs = Math.min(150, 620 / mixers.count);
      for (let i = 0; i < mixers.count; i++) {
        const p = back(prog(t, 3.4 + i * 0.15, 0.5));
        if (p > 0) tank(935 + i * xs, 405, p * Math.min(0.9, xs / 150), t + i * 0.4);
      }
      header(880, 500, count(blenders.count, prog(t, 4.6, 1)), blenders.label, prog(t, 4.4, 0.5));
      const bs = Math.min(60, 620 / blenders.count);
      for (let i = 0; i < blenders.count; i++) {
        const p = back(prog(t, 4.6 + i * 0.1, 0.5));
        if (p > 0) vBlender(905 + i * bs, 575, p, t + i * 0.35);
      }
    },

    range(s, t) {
      const n = s.items.length,
        step = 1400 / n,
        R = Math.min(98, step / 2 - 24),
        k = R / 98;
      const cols: Record<string, string> = {
        coffee: '#c98b4a',
        nutrition: '#6f9bff',
        confectionery: '#ff8fa3',
        dry: '#e9d8a6',
        wet: '#4cc3c3',
      };
      const bp = eo(prog(t, 0.2, 1));
      ga(1);
      ctx.fillStyle = C.belt;
      rr(100, 538, 1400 * bp, 26, 13);
      ctx.fill();
      if (bp >= 1)
        for (let j = 0; j < 15; j++) {
          const f = (t * 0.06 + j / 15) % 1;
          ga(fade(f, 10));
          ctx.fillStyle = cols[s.items[j % n].icon];
          rr(110 + f * 1370, 541, 22, 20, 4);
          ctx.fill();
        }
      s.items.forEach((item, i) => {
        const x = 100 + (i + 0.5) * step,
          p = back(prog(t, 0.4 + i * 0.35, 0.6));
        if (p <= 0) return;
        const col = cols[item.icon];
        ctx.save();
        ctx.translate(x, 300);
        ctx.scale(p * k, p * k);
        ga(0.25 * (0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.7)));
        ctx.strokeStyle = col;
        ctx.lineWidth = 14;
        circle(0, 0, 108);
        ctx.stroke();
        ga(1);
        ctx.fillStyle = C.card;
        circle(0, 0, 98);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ICON[item.icon](t + i);
        ctx.restore();
        const a = prog(t, 0.6 + i * 0.35, 0.5);
        text(item.name, x, 300 + R + 54, 30, { w: 800, al: 'center', a });
        ga(a * 0.6);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(x, 300 + R + 72);
        ctx.lineTo(x, 536);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    },

    products(s, t) {
      text(s.heading, W / 2, 112, 54, { w: 900, head: true, al: 'center', a: eo(prog(t, 0.1, 0.8)) });
      // Live: the turning packs are HTML laid over the canvas (so they can be pointed at). Export: draw them here.
      if (!opts.still) return;
      const list = assets.products,
        n = list.length;
      const placed = list
        .map((p, i) => {
          const a = (i / n) * Math.PI * 2 + 0.3,
            depth = (Math.sin(a) + 1) / 2;
          return {
            p,
            x: W / 2 + Math.cos(a) * 620,
            y: 380 + Math.sin(a) * 170,
            s: 0.55 + depth * 0.6,
            depth,
          };
        })
        .sort((a, b) => a.depth - b.depth);
      placed.forEach(({ p, x, y, s: k, depth }) => img(p.image, x, y, 260 * k, 195 * k, 0.45 + depth * 0.55));
    },

    packaging(s, t) {
      const X0 = 170,
        X1 = 1430,
        Y = 470,
        L0 = Math.log10(s.minGrams),
        L1 = Math.log10(s.maxGrams);
      const fr = (g: number) => (Math.log10(g) - L0) / (L1 - L0),
        px = (g: number) => X0 + fr(g) * (X1 - X0);
      const a = prog(t, 0.2, 0.6);
      ga(a);
      ctx.fillStyle = C.line;
      rr(X0, Y - 2, X1 - X0, 5, 3);
      ctx.fill();
      const ticks = [
        s.minGrams,
        ...[1, 10, 100, 1000, 10000].filter((g) => g > s.minGrams && g < s.maxGrams),
        s.maxGrams,
      ];
      ticks.forEach((g, i) => {
        const x = px(g),
          end = i === 0 || i === ticks.length - 1;
        ga(a);
        ctx.fillStyle = end ? C.amber : '#4a5f94';
        ctx.fillRect(x - 1, Y + 6, 2, end ? 18 : 12);
        text(weight(g), x, Y + 50, end ? 24 : 19, {
          w: end ? 800 : 600,
          c: end ? C.amber : C.muted,
          al: 'center',
          a,
        });
      });
      const m = eio(prog(t, 1.2, 6)),
        g = Math.pow(10, L0 + m * (L1 - L0)),
        mx = X0 + m * (X1 - X0);
      ga(1);
      ctx.fillStyle = C.amber;
      rr(X0, Y - 2, mx - X0, 5, 3);
      ctx.fill();
      if (t > 1.2 && m < 1) {
        ga(0.35);
        circle(mx, Y, 18 + 5 * Math.sin(t * 6));
        ctx.fill();
      }
      ga(a);
      circle(mx, Y, 10);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      text(s.readoutLabel, 800, 108, 20, { w: 800, c: C.muted, al: 'center', ls: 5, a });
      text(m >= 1 ? s.rangeLabel : weight(g), 800, 196, 84, {
        w: 900,
        head: true,
        c: C.amber,
        al: 'center',
        a,
      });
      s.packs.forEach((pk, i) => {
        const p = back(clamp((m - fr(pk.grams) + 0.03) / 0.1));
        if (p <= 0) return;
        const shape = packShape[pk.shape],
          x = px(pk.grams),
          bob = Math.sin(t * 2 + i) * 3;
        ctx.save();
        ctx.translate(x, Y - 16 + bob);
        ctx.scale(p, p);
        ga(1);
        shape.draw();
        if (pk.shape === 'bulk') {
          ctx.font = `900 40px ${HEAD}`;
          ctx.fillStyle = C.card;
          ctx.textAlign = 'center';
          ctx.fillText(weight(pk.grams), 0, -86);
        }
        ctx.restore();
        text(pk.label, x, Y - 16 - shape.h - 22 + bob, 24, { w: 800, al: 'center', a: clamp(p) });
      });
    },

    steps(s, t) {
      const xs = [200, 500, 800, 1100, 1400];
      const bp = eo(prog(t, 0.1, 0.9));
      ga(1);
      ctx.fillStyle = C.belt;
      rr(60, 458, 1480 * bp, 24, 12);
      ctx.fill();
      ctx.strokeStyle = '#3b5087';
      ctx.lineWidth = 2;
      for (let k = 0; k < 37; k++) {
        const x = 60 + ((t * 120 + k * 40) % 1480);
        if (x < 50 + 1480 * bp) {
          ctx.beginPath();
          ctx.moveTo(x, 464);
          ctx.lineTo(x + 8, 470);
          ctx.lineTo(x, 476);
          ctx.stroke();
        }
      }
      const cartons: number[] = [];
      for (let k = 0; k < 14; k++) {
        const age = t - 1.4 - k * 1.3;
        if (age >= 0 && 40 + age * 150 < 1560) cartons.push(40 + age * 150);
      }
      xs.forEach((x, i) => {
        const p = back(prog(t, 0.2 + i * 0.3, 0.6));
        if (p <= 0) return;
        const hot = cartons.some((c) => Math.abs(c - x) < 70);
        ctx.save();
        ctx.translate(x, 300);
        ctx.scale(p, p);
        ga(1);
        ctx.fillStyle = C.card;
        rr(-122, -130, 244, 250, 22);
        ctx.fill();
        ctx.strokeStyle = hot ? C.amber : C.line;
        ctx.lineWidth = hot ? 3 : 2;
        ctx.stroke();
        ctx.fillStyle = C.amber;
        circle(-94, -102, 17);
        ctx.fill();
        ctx.font = `900 18px ${HEAD}`;
        ctx.fillStyle = C.card;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), -94, -96);
        ctx.translate(0, 10);
        if (i === 0) tank(0, 0, 0.95, t);
        if (i === 1) {
          ctx.fillStyle = '#22345f';
          rr(-42, -36, 84, 72, 8);
          ctx.fill();
          const sy = -36 + ((t * 0.9) % 1) * 72;
          ga(0.9);
          ctx.fillStyle = C.amber;
          ctx.fillRect(-46, sy - 1.5, 92, 3);
          ga(0.25);
          ctx.fillRect(-42, sy - 14, 84, 14);
          ga(1);
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 6;
          circle(18, -6, 30);
          ctx.stroke();
          ctx.lineWidth = 9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(40, 16);
          ctx.lineTo(60, 36);
          ctx.stroke();
          ga(Math.sin(t * 3) > 0 || opts.still ? 1 : 0.3);
          ctx.strokeStyle = C.green;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(4, -6);
          ctx.lineTo(14, 5);
          ctx.lineTo(32, -18);
          ctx.stroke();
        }
        if (i === 2) {
          const ph = (t % 2.4) / 2.4,
            c = opts.still ? 1 : ph < 0.55 ? eio(ph / 0.55) : 1,
            an = (1 - c) * 2;
          ga(1);
          ctx.fillStyle = C.amber;
          rr(-46, -14, 92, 62, 3);
          ctx.fill();
          ctx.strokeStyle = '#d99a32';
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          for (const sd of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(46 * sd, -14);
            ctx.lineTo(46 * sd - 46 * sd * Math.cos(an), -14 - 46 * Math.sin(an));
            ctx.stroke();
          }
          if (c >= 1) {
            ctx.fillStyle = '#c98b2a';
            ctx.fillRect(-6, -16, 12, 64);
          }
        }
        if (i === 3) {
          ctx.strokeStyle = '#6f84b8';
          ctx.lineWidth = 4;
          ctx.beginPath();
          for (const px of [-62, 62]) (ctx.moveTo(px, -64), ctx.lineTo(px, 56));
          for (const py of [-4, 52]) (ctx.moveTo(-62, py), ctx.lineTo(62, py));
          ctx.stroke();
          const n = opts.still ? 6 : Math.min(6, Math.floor((t * 1.3) % 8));
          for (let k = 0; k < n; k++) {
            const sx = -40 + (k % 3) * 40,
              sy = k < 3 ? 52 : -4;
            ctx.fillStyle = C.amber;
            rr(sx - 16, sy - 26, 32, 24, 3);
            ctx.fill();
            ctx.fillStyle = '#c98b2a';
            ctx.fillRect(sx - 2, sy - 26, 4, 24);
          }
        }
        if (i === 4) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(-118, -80, 236, 140);
          ctx.clip();
          ctx.fillStyle = C.line;
          ctx.fillRect(-118, 34, 236, 3);
          const f = opts.still ? 0.5 : (t * 0.45) % 1;
          truck(-150 + f * 300, 26, 1.15, fade(f));
          ctx.restore();
        }
        ctx.restore();
        text(s.steps[i], x, 528, 28, { w: 800, al: 'center', a: prog(t, 0.4 + i * 0.3, 0.5) });
      });
      cartons.forEach((x) => carton(x, 446, 1, Math.min(1, (1560 - x) / 60, (x - 40) / 30)));
    },

    clients(s, t) {
      const CW = 400,
        CH = 124;
      const shift = s.more.length ? eio(prog(t, 3.6, 1.2)) : 0;
      const hub: Pt = [380 + (800 - 380) * shift, 330];
      const ys = [170, 330, 490];
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
      const card = (name: string, x: number, y: number, a: number) => {
        ga(a);
        ctx.fillStyle = '#ffffff';
        rr(x, y - CH / 2, CW, CH, 18);
        ctx.fill();
        img(assets.logos.get(name), x + CW / 2, y - 14, 290, 64, a);
        text(s.captions?.[name] ?? name, x + CW / 2, y + 46, 18, { w: 700, c: '#505a70', al: 'center', a });
      };
      const link = (P: [Pt, Pt, Pt, Pt], drawn: number, live: boolean, seed: number) => {
        ga(1);
        strokeCubic(P, drawn, '#3b5087', 4);
        if (!live) return;
        for (let k = 0; k < 3; k++) {
          const f = (t * 0.45 + k / 3 + seed) % 1,
            q = cubic(P, f);
          ga(fade(f));
          ctx.fillStyle = C.amber;
          circle(q[0], q[1], 7);
          ctx.fill();
        }
      };
      // Right-hand clients: in first, then slide right as the hub moves to the centre.
      s.first.forEach((name, i) => {
        const cp = eo(prog(t, 0.9 + i * 0.5, 0.8)),
          x = 1000 + (1 - cp) * 90 + 140 * shift,
          y = ys[i];
        link(
          [
            [hub[0] + 132, hub[1]],
            [hub[0] + 300, hub[1]],
            [x - 160, y],
            [x - 8, y],
          ],
          eio(prog(t, 0.7 + i * 0.5, 0.9)),
          t > 1.8 + i * 0.5,
          i * 0.2,
        );
        card(name, x, y, cp);
      });
      // Left-hand clients, once the hub is centred.
      s.more.forEach((name, i) => {
        const st = 4.6 + i * 0.45,
          cp = eo(prog(t, st + 0.2, 0.8)),
          x = 60 - (1 - cp) * 90,
          y = ys[i];
        link(
          [
            [hub[0] - 132, hub[1]],
            [hub[0] - 300, hub[1]],
            [x + CW + 160, y],
            [x + CW + 8, y],
          ],
          eio(prog(t, st, 0.9)),
          t > st + 1.1,
          i * 0.2 + 0.1,
        );
        card(name, x, y, cp);
      });
      const ap = back(prog(t, 0.2, 0.7));
      ga(0.25 * pulse);
      ctx.fillStyle = C.amber;
      circle(hub[0], hub[1], 150 * ap);
      ctx.fill();
      ga(1);
      ctx.fillStyle = '#ffffff';
      circle(hub[0], hub[1], 128 * ap);
      ctx.fill();
      img(assets.kjsDark, hub[0], hub[1], 200 * ap, 90 * ap, prog(t, 0.4, 0.5));
    },

    handover(s, t) {
      const fp = back(prog(t, 0.2, 0.7));
      img(assets.kjs, 300, 170, 260 * fp, 90, prog(t, 0.3, 0.6));
      ctx.save();
      ctx.translate(300, 390);
      ctx.scale(fp, fp);
      ga(1);
      ctx.beginPath();
      ctx.moveTo(-150, 90);
      ctx.lineTo(-150, -40);
      for (let k = 0; k < 4; k++) (ctx.lineTo(-150 + k * 75, -96), ctx.lineTo(-150 + (k + 1) * 75, -40));
      ctx.lineTo(150, 90);
      ctx.closePath();
      ctx.fillStyle = C.card;
      ctx.fill();
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillRect(92, -150, 28, 90);
      ctx.strokeRect(92, -150, 28, 90);
      for (let k = 0; k < 4; k++) {
        ga(0.55 + 0.45 * Math.sin(t * 2 + k));
        ctx.fillStyle = C.amber2;
        rr(-120 + k * 66, 0, 42, 30, 4);
        ctx.fill();
      }
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.5 + k / 4) % 1;
        ga((1 - ph) * 0.5);
        ctx.fillStyle = '#c9d1e4';
        circle(106 + ph * 30, -160 - ph * 70, 10 + ph * 18);
        ctx.fill();
      }
      ctx.restore();
      text(s.makerLabel, 300, 540, 28, { w: 800, al: 'center', a: prog(t, 0.6, 0.5) });
      const bp = eo(prog(t, 0.9, 0.8));
      ga(1);
      ctx.fillStyle = C.belt;
      rr(470, 418, 360 * bp, 24, 12);
      ctx.fill();
      if (t > 1.7)
        for (let k = 0; k < 5; k++) {
          const f = (t * 0.35 + k / 5) % 1;
          carton(482 + f * 330, 404, 0.9, fade(f, 8));
        }
      const mp = back(prog(t, 1.4, 0.7));
      ctx.save();
      ctx.translate(970, 430);
      ctx.scale(mp, mp);
      ga(1);
      ctx.fillStyle = assets.partnerLogo ? '#ffffff' : '#1f2e55';
      rr(-136, -74, 272, 148, 26);
      ctx.fill();
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 3;
      ctx.stroke();
      if (assets.partnerLogo) img(assets.partnerLogo, 0, 0, 220, 110);
      else {
        ctx.font = `900 54px ${HEAD}`;
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        ctx.fillText(s.partnerName, 0, 18);
      }
      ctx.restore();
      text(s.partnerLabel, 970, 540, 28, { w: 800, al: 'center', a: prog(t, 1.7, 0.5) });
      const branches: [Pt, Pt, Pt, Pt][] = [
        [
          [1108, 430],
          [1200, 430],
          [1210, 230],
          [1290, 230],
        ],
        [
          [1108, 430],
          [1200, 430],
          [1210, 640],
          [1290, 640],
        ],
      ];
      branches.forEach((P, i) => {
        ga(1);
        strokeCubic(P, eio(prog(t, 2 + i * 0.2, 0.8)), '#3b5087', 4);
        if (t > 3)
          for (let k = 0; k < 3; k++) {
            const f = (t * 0.5 + k / 3 + i * 0.17) % 1,
              q = cubic(P, f);
            carton(q[0], q[1], 0.6, fade(f));
          }
      });
      const sp = back(prog(t, 2.5, 0.7));
      ctx.save();
      ctx.translate(1420, 230);
      ctx.scale(sp, sp);
      ga(1);
      ctx.fillStyle = '#1f2e55';
      rr(-100, -70, 200, 130, 8);
      ctx.fill();
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = C.blue;
      rr(-100, -70, 200, 30, [8, 8, 0, 0]);
      ctx.fill();
      ctx.font = `800 15px ${BODY}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      spacing(3);
      ctx.fillText(s.shopSign, 0, -49);
      spacing(0);
      for (let k = 0; k < 4; k++) {
        ga(0.5 + 0.4 * Math.sin(t * 2 + k));
        ctx.fillStyle = '#bfe8ff';
        ctx.fillRect(-86 + k * 44, -28, 36, 34);
      }
      ga(1);
      ctx.fillStyle = '#0b1328';
      ctx.fillRect(-18, 14, 36, 46);
      ctx.restore();
      const [mt, gt] = s.channels;
      text(mt.name, 1420, 340, 28, { w: 800, al: 'center', a: prog(t, 2.7, 0.5) });
      text(mt.sub, 1420, 368, 19, { w: 500, c: C.muted, al: 'center', a: prog(t, 2.7, 0.5) });
      const gp = back(prog(t, 2.8, 0.7));
      ctx.save();
      ctx.translate(1420, 610);
      ctx.scale(gp, gp);
      ga(1);
      ctx.fillStyle = C.card;
      rr(-86, -40, 172, 96, 6);
      ctx.fill();
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : C.amber;
        ctx.beginPath();
        ctx.moveTo(-96 + k * 24, -66);
        ctx.lineTo(-72 + k * 24, -66);
        ctx.lineTo(-72 + k * 24, -40);
        ctx.arc(-84 + k * 24, -40, 12, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
      }
      const packCols = ['#ff8fa3', '#6f9bff', '#4cc3c3', '#e9d8a6', '#c98b4a'];
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = packCols[k % 5];
        rr(-74 + (k % 5) * 30, -18 + Math.floor(k / 5) * 30, 20, 24, 3);
        ctx.fill();
      }
      ctx.restore();
      text(gt.name, 1420, 700, 28, { w: 800, al: 'center', a: prog(t, 3, 0.5) });
      text(gt.sub, 1420, 728, 19, { w: 500, c: C.muted, al: 'center', a: prog(t, 3, 0.5) });
    },

    map(s, t) {
      const a = eo(prog(t, 0, 1));
      if (assets.india) {
        ctx.save();
        ctx.translate(MX, MY);
        ctx.scale(MK, MK);
        ctx.translate(-68, 37.2);
        ga(a);
        const mg = ctx.createLinearGradient(68, -37, 97, -7);
        mg.addColorStop(0, '#22386a');
        mg.addColorStop(1, '#16264b');
        ctx.fillStyle = mg;
        ctx.fill(assets.india);
        ctx.strokeStyle = '#5675bd';
        ctx.lineWidth = 1.6 / MK;
        ctx.lineJoin = 'round';
        ctx.stroke(assets.india);
        ctx.restore();
      }
      CITIES.forEach((c, i) => {
        const st = 1.2 + i * 0.55,
          p = eio(prog(t, st, 2.6));
        if (p > 0) {
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) {
            const q = quad(c, (k / 40) * p);
            if (k) ctx.lineTo(q[0], q[1]);
            else ctx.moveTo(q[0], q[1]);
          }
          ga(0.9);
          ctx.strokeStyle = C.amber;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        if (p > 0 && p < 1) {
          const q = quad(c, p),
            d = quadD(c, p);
          ctx.save();
          ctx.translate(q[0], q[1]);
          ctx.rotate(Math.atan2(d[1], d[0]));
          ga(1);
          ctx.fillStyle = '#ffffff';
          rr(-14, -7, 28, 14, 3);
          ctx.fill();
          ctx.fillStyle = C.amber;
          rr(-14, -7, 19, 14, 3);
          ctx.fill();
          ctx.restore();
        }
        const arrived = t - (st + 2.6);
        ga(a);
        ctx.fillStyle = p >= 1 ? C.amber : '#8ea4d8';
        circle(c.x, c.y, p >= 1 ? 7 : 4.5);
        ctx.fill();
        if (arrived > 0) {
          for (let k = 0; k < 2; k++) {
            const ph = (arrived * 0.6 + k * 0.5) % 1;
            ga((1 - ph) * 0.7);
            ctx.strokeStyle = C.amber;
            ctx.lineWidth = 2;
            circle(c.x, c.y, 8 + ph * 26);
            ctx.stroke();
          }
          const dots: Pt[] = [
            [12, -9],
            [14, 9],
            [-11, 12],
            [-4, 17],
            [6, -16],
          ];
          dots.forEach(([dx, dy], k) => {
            ga(clamp((arrived - k * 0.12) * 3) * (0.6 + 0.4 * Math.sin(t * 3 + k + i)));
            ctx.fillStyle = C.blue;
            circle(c.x + dx, c.y + dy, 2.6);
            ctx.fill();
          });
        }
        text(c.name, c.right ? c.x + 14 : c.x - 14, c.y + 6, 20, {
          w: 800,
          al: c.right ? 'left' : 'right',
          a: clamp(arrived * 2 + 0.6) * a,
          outline: true,
        });
      });
      const [ox, oy] = ORIGIN,
        k = (t % 1.6) / 1.6;
      ga((1 - k) * a);
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 3;
      circle(ox, oy, 12 + k * 30);
      ctx.stroke();
      ga(a);
      ctx.fillStyle = C.amber;
      circle(ox, oy, 11);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      text(s.originLabel, ox + 18, oy + 36, 20, { w: 800, a, outline: true });
      s.counters.forEach((cn, i) => {
        const y = 180 + i * 150,
          ca = prog(t, 0.6 + i * 0.3, 0.6),
          v = Math.round(cn.value * eo(prog(t, 1.2, 5.5)));
        text(v.toLocaleString('en-IN') + (cn.suffix ?? ''), 130, y, 88, {
          w: 900,
          head: true,
          c: C.amber,
          a: ca,
        });
        text(cn.label, 130, y + 38, 24, { c: C.muted, a: ca });
      });
      if (s.note) text(s.note, 1560, 870, 16, { w: 500, c: '#6f7d9e', al: 'right', a });
    },
  };

  const scene = (i: number, t: number, alpha: number) => {
    const s = content.marico.scenes[i];
    if (!s) return;
    SA = alpha;
    (draw[s.kind] as (s: FilmScene, t: number) => void)(s, t);
    ctx.globalAlpha = 1;
    SA = 1;
  };

  /** The caption, drawn the way the live HTML caption looks (export only). */
  const caption = (s: FilmScene) => {
    if (s.kind === 'title' || !s.title) return;
    const g = ctx.createLinearGradient(0, 0, W * 0.62, 0);
    g.addColorStop(0, 'rgba(7,13,30,0.95)');
    g.addColorStop(0.6, 'rgba(7,13,30,0.8)');
    g.addColorStop(1, 'rgba(7,13,30,0)');
    const top = s.stats?.length ? 640 : 700;
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, top - 20, W * 0.62, H - top + 20);
    let y = top + 22;
    if (s.eyebrow) text(s.eyebrow.toUpperCase(), 52, y, 17, { w: 800, c: C.amber, ls: 2.5 });
    y += 50;
    text(s.title, 52, y, 44, { w: 900, head: true });
    if (s.line) text(s.line, 52, (y += 36), 21, { w: 500, c: '#c9d1e4' });
    let x = 52;
    if (s.stats?.length) {
      y += 54;
      s.stats.forEach((st) => {
        const w1 = text(st.value, x, y, 36, { w: 900, head: true, c: C.amber });
        const w2 = text(st.label, x, y + 24, 16, { c: C.muted });
        x += Math.max(w1, w2) + 40;
      });
    }
  };

  return { background, scene, caption };
}
