/** Product details pop-up (native <dialog>). Close with ×, Escape, or a click outside. */
import type { Content, Product } from '../../content/content.schema';
import { h } from '../lib/dom';

let dialog: HTMLDialogElement | undefined;

/** Group, unit and the product's own specs as label/value rows. */
export function productSpecs(product: Product, content: Content): HTMLElement {
  const unit = content.units.find((u) => u.id === product.unit);
  const rows = [
    { label: 'Group', value: product.group },
    ...(unit ? [{ label: 'Made in', value: unit.title }] : []),
    ...product.specs,
  ];
  return h(
    'dl',
    { class: 'product-specs' },
    ...rows.map((r) => h('div', {}, h('dt', {}, r.label), h('dd', {}, r.value))),
  );
}

export function openProduct(product: Product, content: Content): void {
  if (!dialog) {
    dialog = h('dialog', { class: 'product-dialog', 'aria-labelledby': 'product-dialog-title' });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // click on the backdrop
    });
    document.body.append(dialog);
  }
  const close = h('button', { type: 'button', class: 'dialog-close', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', () => dialog!.close());

  dialog.replaceChildren(
    close,
    h(
      'div',
      { class: 'product-dialog-body' },
      h(
        'div',
        { class: 'product-photo' },
        h('img', { src: product.featuredImage ?? product.image, alt: product.name }),
      ),
      h(
        'div',
        { class: 'product-profile' },
        h('p', { class: 'eyebrow' }, product.group),
        h('h2', { id: 'product-dialog-title' }, product.name),
        product.description ? h('p', {}, product.description) : null,
        productSpecs(product, content),
      ),
    ),
  );
  dialog.showModal();
}
