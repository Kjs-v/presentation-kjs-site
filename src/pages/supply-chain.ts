/**
 * Supply Chain ("/supply-chain").
 * A real-time 3D scene (Three.js): a forklift loads the last pallets into a KJS truck at the Unit 1 dock,
 * the truck drives off, then trucks travel from Hyderabad to every destination on an India map, chapter by chapter.
 * All words, cities, routes and numbers come from content.supplyChain. The India outline is an SVG in /media/maps/.
 * The scene stops itself (and frees the GPU) when the page is left.
 */
import type { Page } from '../lib/router';
import { h } from '../lib/dom';

export const supplyChainPage: Page = (content) => {
  const sc = content.supplyChain;
  const steps = h(
    'ol',
    { class: 'sc-steps' },
    ...sc.steps.map((s, i) => h('li', {}, h('b', {}, String(i + 1)), s)),
  );
  const body = h('div', { class: 'sc-body' });
  const root = h(
    'div',
    { class: 'page-supply-chain wrap padded' },
    h(
      'div',
      { class: 'sc-head' },
      h(
        'div',
        {},
        h('p', { class: 'eyebrow' }, sc.eyebrow),
        h('h1', {}, sc.title),
        h('p', { class: 'lead' }, sc.intro),
      ),
      steps,
    ),
    body,
  );

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
  // The router has no "leave" hook, so watch for the page leaving the document.
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
};
