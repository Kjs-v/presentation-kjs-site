/**
 * Supply Chain section (Unit 2 → Supply Chain, "/unit-2/supply-chain"; the old "/supply-chain" redirects there).
 * A real-time 3D scene (Three.js): a forklift loads the last pallets into a KJS truck at the Unit 1 dock,
 * the truck drives off, then trucks travel from Hyderabad to every destination on an India map, chapter by chapter.
 * All words, cities, routes and numbers come from content.supplyChain. The India outline is an SVG in /media/maps/.
 * The scene stops itself (and frees the GPU) when the section is left.
 */
import type { Content } from '../../content/content.schema';
import { h } from '../lib/dom';

function head(sc: Content['supplyChain']) {
  const steps = h(
    'ol',
    { class: 'sc-steps' },
    ...sc.steps.map((s, i) => h('li', {}, h('b', {}, String(i + 1)), s)),
  );
  const el = h(
    'div',
    { class: 'sc-head' },
    h(
      'div',
      {},
      h('p', { class: 'eyebrow' }, sc.eyebrow),
      h('h2', { class: 'sc-title' }, sc.title),
      h('p', { class: 'lead' }, sc.intro),
    ),
    steps,
  );
  return { el, steps };
}

/** Without the 3D scene: title, steps and the list of destinations. Used in the full-profile PDF. */
export function supplyChainSummary(content: Content): HTMLElement {
  const sc = content.supplyChain;
  return h(
    'div',
    { class: 'page-supply-chain' },
    head(sc).el,
    h(
      'p',
      { class: 'sc-print-route' },
      h('strong', {}, sc.origin.name),
      ' → ',
      sc.destinations.map((d) => d.city).join(' · '),
    ),
  );
}

export function supplyChainSection(content: Content): HTMLElement {
  const sc = content.supplyChain;
  const { el, steps } = head(sc);
  const body = h('div', { class: 'sc-body' });
  const root = h('div', { class: 'page-supply-chain' }, el, body);

  let stop: (() => void) | null = null;
  let left = false;
  const mount = () => {
    stop?.();
    stop = null;
    body.replaceChildren();
    void import('./supply-chain-scene').then(({ scene }) => {
      if (!left) stop = scene(content, body, steps, mount);
    });
  };
  mount();
  // The router has no "leave" hook, so watch for the section leaving the document.
  const watch = () => {
    if (!root.isConnected && root.dataset.started) {
      left = true;
      stop?.();
      stop = null;
      return;
    }
    if (root.isConnected) root.dataset.started = '1';
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  return root;
}
