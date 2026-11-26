/**
 * "Download PDF" menu in the header.
 * - This page: the page on screen, laid out for paper (see the @media print rules in theme.css).
 * - Full company profile: About, every unit section, Promoter Profile and Gallery, one after another.
 * Both use the browser's own "Save as PDF", so text stays sharp and searchable. All words come from site.menu.download.
 * The 3D supply-chain scene is saved as a still picture (canvases are swapped for an image while printing).
 */
import type { Content } from '../../content/content.schema';
import { h } from '../lib/dom';
import { icon } from '../lib/icons';
import { aboutPage } from '../pages/about';
import { galleryPage } from '../pages/gallery';
import { promotersPage } from '../pages/promoters';
import { supplyChainSummary } from '../pages/supply-chain';
import { unitPage, unitPanel } from '../pages/unit';

/** Every page of the profile, in order. Built fresh each time so it always matches the current content. */
function profileBook(content: Content): HTMLElement {
  const chapter = (el: HTMLElement) => h('div', { class: 'print-chapter' }, el);
  const units = content.units.flatMap((unit) => [
    chapter(unitPage(content, { unitId: unit.id })),
    ...unit.tabs.map((tab) =>
      tab.id === 'supply-chain'
        ? h('section', { class: 'unit-panel' }, h('div', { class: 'wrap' }, supplyChainSummary(content)))
        : unitPanel(unit, tab, content),
    ),
  ]);
  return h(
    'div',
    { id: 'print-book', 'aria-hidden': 'true' },
    chapter(aboutPage(content, {})),
    ...units,
    chapter(promotersPage(content, {})),
    chapter(galleryPage(content, {})),
  );
}

/** Waits until every image inside `root` has loaded (or failed), so none is missing from the PDF. */
async function imagesReady(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  images.forEach((img) => img.removeAttribute('loading'));
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((done) => {
            img.addEventListener('load', () => done(), { once: true });
            img.addEventListener('error', () => done(), { once: true });
          }),
    ),
  );
}

/** Swaps 3D canvases for a still picture while printing (canvases print blank in most browsers). */
function snapshotCanvases(): () => void {
  const added: HTMLImageElement[] = [];
  document.querySelectorAll<HTMLCanvasElement>('main canvas').forEach((canvas) => {
    try {
      const img = h('img', { src: canvas.toDataURL('image/png'), alt: '', class: 'print-snapshot' });
      canvas.after(img);
      added.push(img);
    } catch {
      /* a canvas that cannot be read is simply left out */
    }
  });
  return () => added.forEach((img) => img.remove());
}

export function downloadMenu(content: Content): HTMLElement {
  const t = content.site.menu.download;
  const button = h(
    'button',
    { type: 'button', class: 'ctrl', title: t.label, 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    icon('download'),
    h('span', { class: 'ctrl-label' }, t.label),
  );
  const thisPage = h('button', { type: 'button', class: 'colour-mode', role: 'menuitem' }, t.thisPage);
  const profile = h('button', { type: 'button', class: 'colour-mode', role: 'menuitem' }, t.fullProfile);
  const status = h('p', { class: 'download-status', role: 'status' });
  const pop = h('div', { class: 'colour-pop download-pop', role: 'menu' }, thisPage, profile, status);
  pop.hidden = true;
  const wrap = h('div', { class: 'colour-wrap' }, button, pop);

  const close = () => {
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (e: Event) => {
    if (!wrap.contains(e.target as Node)) close();
  };
  button.addEventListener('click', () => {
    if (!pop.hidden) return close();
    pop.hidden = false;
    status.textContent = '';
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      button.focus();
    }
  });

  thisPage.addEventListener('click', () => {
    close();
    window.print();
  });
  profile.addEventListener('click', async () => {
    status.textContent = t.preparing;
    const book = profileBook(content);
    document.body.append(book);
    document.body.classList.add('printing-book');
    await imagesReady(book);
    close();
    window.print();
  });

  // Also covers Ctrl+P. The profile is removed once the print dialog closes.
  let restore: (() => void) | null = null;
  window.addEventListener('beforeprint', () => (restore = snapshotCanvases()));
  window.addEventListener('afterprint', () => {
    restore?.();
    restore = null;
    document.getElementById('print-book')?.remove();
    document.body.classList.remove('printing-book');
  });

  return wrap;
}
