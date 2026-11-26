/** Tiny helpers for building DOM safely (text is always escaped). */

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** A link that navigates inside the app without reloading. */
export function routeLink(path: string, label: string, className = ''): HTMLAnchorElement {
  return h('a', { href: path, 'data-route': true, class: className }, label);
}

/** A content button: a page inside the app, or a website (https://...), optionally in a new tab. */
export function buttonLink(
  b: { path: string; label: string; style: string; newTab?: boolean },
  className = 'cta',
): HTMLAnchorElement {
  const cls = `${b.style} ${className}`;
  if (/^https?:\/\//.test(b.path) || b.newTab)
    return h(
      'a',
      { href: b.path, class: cls, ...(b.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
      b.label,
    );
  return routeLink(b.path, b.label, cls);
}
