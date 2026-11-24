/**
 * Colour menu in the header.
 * 1. Pick "White" or "Multi colour" (Multi colour opens a palette of swatches plus "any colour").
 * 2. The page previews the colour, then asks: this page only, or all pages?
 * Choices are saved in this browser (src/lib/theme.ts). All words and swatches come from site.menu.colour.
 */
import type { Site } from '../../content/content.schema';
import { h } from '../lib/dom';
import { applyPageColour, previewColour, saveColour, savedColour } from '../lib/theme';

export function colourMenu(site: Site): HTMLElement {
  const t = site.menu.colour;
  const button = h(
    'button',
    {
      type: 'button',
      class: 'ctrl',
      title: site.menu.themeToggleLabel,
      'aria-label': site.menu.themeToggleLabel,
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    },
    h('span', { class: 'theme-dot', 'aria-hidden': 'true' }),
  );

  const whiteBtn = h(
    'button',
    { type: 'button', class: 'colour-mode' },
    h('i', { class: 'colour-chip white' }),
    t.whiteLabel,
  );
  const multiBtn = h(
    'button',
    { type: 'button', class: 'colour-mode' },
    h('i', { class: 'colour-chip multi' }),
    t.multiLabel,
  );
  const custom = h('input', { type: 'color', value: '#1c3a9e', 'aria-label': t.customLabel });
  const swatches = h(
    'div',
    { class: 'colour-swatches' },
    ...t.swatches.map((s) => {
      const b = h('button', {
        type: 'button',
        class: 'colour-swatch',
        title: s.label,
        'aria-label': s.label,
      });
      b.style.background = s.color;
      b.addEventListener('click', () => pick(s.color));
      return b;
    }),
    h('label', { class: 'colour-custom' }, custom, t.customLabel),
  );
  swatches.hidden = true;

  const thisPage = h('button', { type: 'button', class: 'colour-scope-btn' }, t.thisPage);
  const allPages = h('button', { type: 'button', class: 'colour-scope-btn' }, t.allPages);
  const cancel = h('button', { type: 'button', class: 'colour-cancel' }, t.cancel);
  const scope = h(
    'div',
    { class: 'colour-scope' },
    h('p', {}, t.scopeQuestion),
    h('div', { class: 'colour-scope-row' }, thisPage, allPages),
    cancel,
  );
  scope.hidden = true;

  const pop = h(
    'div',
    { class: 'colour-pop', role: 'dialog', 'aria-label': site.menu.themeToggleLabel },
    h('div', { class: 'colour-modes' }, whiteBtn, multiBtn),
    swatches,
    scope,
  );
  pop.hidden = true;
  const wrap = h('div', { class: 'colour-wrap' }, button, pop);

  let pending: string | null = null;
  const open = () => {
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    scope.hidden = true;
    pending = null;
    const current = savedColour(location.pathname);
    swatches.hidden = !current;
    whiteBtn.classList.toggle('on', !current);
    multiBtn.classList.toggle('on', Boolean(current));
    if (current) custom.value = current;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onEsc, true);
  };
  const close = (revert: boolean) => {
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (revert) applyPageColour(location.pathname);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onEsc, true);
  };
  const outside = (e: Event) => {
    if (!wrap.contains(e.target as Node)) close(true);
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !document.fullscreenElement) {
      e.stopPropagation();
      close(true);
      button.focus();
    }
  };
  function pick(color: string) {
    pending = color;
    previewColour(color);
    scope.hidden = false;
    thisPage.focus();
  }

  button.addEventListener('click', () => (pop.hidden ? open() : close(true)));
  whiteBtn.addEventListener('click', () => {
    whiteBtn.classList.add('on');
    multiBtn.classList.remove('on');
    swatches.hidden = true;
    pick('white');
  });
  multiBtn.addEventListener('click', () => {
    multiBtn.classList.add('on');
    whiteBtn.classList.remove('on');
    swatches.hidden = false;
    scope.hidden = true;
  });
  custom.addEventListener('input', () => previewColour(custom.value));
  custom.addEventListener('change', () => pick(custom.value));
  thisPage.addEventListener('click', () => {
    if (pending) saveColour(pending, 'page', location.pathname);
    close(false);
  });
  allPages.addEventListener('click', () => {
    if (pending) saveColour(pending, 'all', location.pathname);
    close(false);
  });
  cancel.addEventListener('click', () => close(true));

  return wrap;
}
