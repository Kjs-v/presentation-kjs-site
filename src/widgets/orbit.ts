/**
 * Products slowly orbiting on a tilted ellipse. Items always face the viewer;
 * the ones in front are bigger and brighter. Hovering or focusing an item pauses the rotation.
 * Respects "reduce motion" (no rotation, items stay spread out).
 */
import { h } from '../lib/dom';

export type OrbitItem = { id: string; name: string; image: string };

export function orbit(
  items: OrbitItem[],
  options: { rotationSeconds: number; onPick: (id: string) => void },
): HTMLElement {
  const root = h('div', { class: 'orbit' });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nodes = items.map((item) => {
    const button = h(
      'button',
      { type: 'button', class: 'orbit-item', 'aria-label': `Open ${item.name}` },
      h('img', { src: item.image, alt: '', draggable: 'false' }),
      h('span', { class: 'orbit-label' }, item.name),
    );
    button.addEventListener('click', () => options.onPick(item.id));
    root.append(button);
    return button;
  });

  let paused = false;
  root.addEventListener('pointerover', (e) => {
    if ((e.target as Element).closest('.orbit-item')) paused = true;
  });
  root.addEventListener('pointerout', (e) => {
    if (!(e.relatedTarget as Element | null)?.closest?.('.orbit-item')) paused = false;
  });
  root.addEventListener('focusin', () => (paused = true));
  root.addEventListener('focusout', () => (paused = false));

  let width = 0;
  let height = 0;
  const sizer = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
  });
  sizer.observe(root);

  const step = (Math.PI * 2) / items.length;
  const speed = (Math.PI * 2) / (options.rotationSeconds * 1000); // radians per ms
  let angle = 0;
  let last = performance.now();

  const place = () => {
    const rx = width * 0.4;
    const ry = height * 0.26;
    nodes.forEach((node, i) => {
      const a = angle + i * step;
      const depth = (Math.sin(a) + 1) / 2; // 0 = back, 1 = front
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      node.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${0.55 + depth * 0.6})`;
      node.style.zIndex = String(Math.round(depth * 100));
      node.style.setProperty('--depth', depth.toFixed(3));
      node.classList.toggle('is-front', depth > 0.93);
    });
  };

  const frame = (now: number) => {
    if (!root.isConnected) return sizer.disconnect(); // page changed: stop the loop
    const dt = Math.min(now - last, 100);
    last = now;
    if (!paused && !reduced) angle += speed * dt;
    place();
    requestAnimationFrame(frame);
  };
  // Start once the element is on the page.
  requestAnimationFrame(() => {
    last = performance.now();
    requestAnimationFrame(frame);
  });
  return root;
}
