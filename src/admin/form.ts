/**
 * Builds edit forms from the content schema (JSON Schema made by /api/admin/schema).
 *
 * Every field reads and writes one spot in a plain JS value. Lists can be reordered by dragging or with
 * ↑/↓, items can be added and removed, and long lists get a search box. Field labels come from the
 * `.describe()` text in content/content.schema.ts, so adding a field there adds it here automatically.
 */
import mediaFiles from 'virtual:media-list';
import { h } from '../lib/dom';

export type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema | Schema[]; // a list of schemas = fixed-length pair, e.g. [latitude, longitude]
  additionalProperties?: Schema | boolean; // object with free keys (name → text)
  anyOf?: Schema[];
  enum?: string[];
  const?: string;
  pattern?: string;
  description?: string;
  minLength?: number;
};

type Ctx = { path: string; changed: () => void };
type Get = () => unknown;
type Set = (value: unknown) => void;

const LONG_TEXT = /^(body|summary|description|subtitle|lede|text|note|address|rimText|title)$/;
const MEDIA = /media/;

/** "featuredImage" → "Featured image" (used when a field has no description). */
const humanize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ ([A-Z])/g, (_, c: string) => ' ' + c.toLowerCase());

const labelOf = (key: string, schema: Schema) => schema.description ?? humanize(key);

/** A starting value for a new list item. */
export function defaultFor(schema: Schema): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.anyOf) return defaultFor(schema.anyOf[0]);
  if (schema.enum) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const key of schema.required ?? []) out[key] = defaultFor(schema.properties![key]);
      return out;
    }
    case 'array':
      return Array.isArray(schema.items) ? schema.items.map(defaultFor) : [];
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return 0;
    default:
      return '';
  }
}

/** A short title for a list item: its name, title, label… or its position. */
function itemTitle(value: unknown, index: number): string {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const key of ['name', 'title', 'label', 'caption', 'id', 'value']) {
      if (typeof v[key] === 'string' && v[key]) return String(v[key]);
      if (typeof v[key] === 'number') return String(v[key]);
    }
  }
  if (typeof value === 'string' && value) return value;
  return `Item ${index + 1}`;
}

const datalist = (() => {
  let made = false;
  return () => {
    if (made) return;
    made = true;
    document.body.append(
      h('datalist', { id: 'media-files' }, ...mediaFiles.map((f) => h('option', { value: f }))),
    );
  };
})();

// ---------- Field editors ----------

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A PIN kept only as its SHA-256 (e.g. marico.lock.pinHash). Staff type the new PIN; only its hash is saved.
 * The number of digits must match the "Number of digits" field next to it.
 */
function pinHashField(get: Get, set: Set, ctx: Ctx): HTMLElement {
  const id = `f-${ctx.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const input = h('input', {
    id,
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'new-password',
    placeholder: get() ? 'PIN is set. Type digits to change it' : 'Type the PIN',
  }) as HTMLInputElement;
  const hint = h('small', { class: 'f-hint' });
  input.addEventListener('input', async () => {
    input.value = input.value.replace(/\D/g, '');
    const digits = input.value;
    if (!digits) {
      hint.textContent = '';
      return;
    }
    if (digits.length < 4) {
      hint.textContent = 'At least 4 digits.';
      return;
    }
    set(await sha256(digits));
    hint.textContent = `New ${digits.length}-digit PIN set. Make "Number of digits" match, then save. Write the PIN down: it can't be shown again.`;
    ctx.changed();
  });
  return h(
    'div',
    { class: 'f-field', 'data-path': ctx.path },
    h('label', { for: id }, 'PIN'),
    h('div', { class: 'f-control' }, input),
    hint,
  );
}

function stringField(
  key: string,
  schema: Schema,
  get: Get,
  set: Set,
  ctx: Ctx,
  optional: boolean,
): HTMLElement {
  if (key === 'pinHash') return pinHashField(get, set, ctx);
  const id = `f-${ctx.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const value = (get() as string | undefined) ?? '';
  const isMedia = Boolean(schema.pattern && MEDIA.test(schema.pattern));
  const isColour = /colors\.[a-zA-Z]+$/.test(ctx.path);
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

  if (schema.enum) {
    input = h(
      'select',
      { id },
      ...schema.enum.map((o) => h('option', { value: o, selected: o === value }, o)),
    );
  } else if (
    LONG_TEXT.test(key) &&
    !isMedia &&
    (value.length > 60 || ['body', 'summary', 'description'].includes(key))
  ) {
    input = h('textarea', { id, rows: Math.min(8, Math.max(2, Math.ceil(value.length / 70))) });
    input.value = value;
  } else {
    input = h('input', {
      id,
      type: 'text',
      value,
      list: isMedia ? 'media-files' : undefined,
      spellcheck: !isMedia,
    });
    if (isMedia) datalist();
  }

  const extra: HTMLElement[] = [];
  const preview = isMedia ? h('img', { class: 'f-preview', alt: '', loading: 'lazy' }) : undefined;
  const swatch = isColour ? h('span', { class: 'f-swatch' }) : undefined;
  const picker = isColour
    ? (h('input', { type: 'color', class: 'f-picker', 'aria-label': 'Pick colour' }) as HTMLInputElement)
    : undefined;
  if (preview) extra.push(preview);
  if (swatch) extra.push(swatch);
  if (picker) extra.push(picker);
  const hint = h('small', { class: 'f-hint' });

  const refresh = () => {
    const v = input.value;
    if (preview) {
      preview.hidden = !v || !/\.(jpe?g|png|webp|gif|svg)$/i.test(v);
      if (!preview.hidden) preview.src = v;
    }
    if (swatch) swatch.style.background = v;
    if (picker) {
      picker.hidden = !/^#[0-9a-f]{6}$/i.test(v);
      if (!picker.hidden) picker.value = v;
    }
    const bad = schema.pattern && v && !new RegExp(schema.pattern).test(v);
    hint.textContent = bad
      ? isMedia
        ? 'Use a file from /media/… (start typing to see suggestions)'
        : 'This value does not look right.'
      : '';
    wrap.classList.toggle('f-invalid', Boolean(bad));
  };
  const onInput = () => {
    const v = input.value;
    set(optional && v === '' ? undefined : v);
    refresh();
    ctx.changed();
  };
  input.addEventListener('input', onInput);
  input.addEventListener('change', onInput);
  picker?.addEventListener('input', () => {
    input.value = picker.value;
    onInput();
  });

  const wrap = h(
    'div',
    { class: 'f-field', 'data-path': ctx.path },
    h(
      'label',
      { for: id },
      labelOf(key, schema),
      optional ? h('span', { class: 'f-optional' }, ' (optional)') : null,
    ),
    h('div', { class: 'f-control' }, input, ...extra),
    hint,
  );
  refresh();
  return wrap;
}

function numberOrTextField(
  key: string,
  schema: Schema,
  get: Get,
  set: Set,
  ctx: Ctx,
  optional: boolean,
): HTMLElement {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const id = `f-${ctx.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const onlyNumber = !types.includes('string');
  const input = h('input', {
    id,
    type: onlyNumber ? 'number' : 'text',
    step: types.includes('integer') ? '1' : 'any',
    value: get() === undefined ? '' : String(get()),
  });
  input.addEventListener('input', () => {
    const raw = input.value;
    if (raw === '' && optional) set(undefined);
    else if (onlyNumber) set(raw === '' ? 0 : Number(raw));
    else set(/^-?\d+(\.\d+)?$/.test(raw.trim()) && typeof get() === 'number' ? Number(raw) : raw);
    ctx.changed();
  });
  return h(
    'div',
    { class: 'f-field', 'data-path': ctx.path },
    h('label', { for: id }, labelOf(key, schema)),
    h('div', { class: 'f-control' }, input),
  );
}

function booleanField(key: string, schema: Schema, get: Get, set: Set, ctx: Ctx): HTMLElement {
  const id = `f-${ctx.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const box = h('input', { id, type: 'checkbox', checked: Boolean(get()) });
  box.addEventListener('change', () => {
    set(box.checked);
    ctx.changed();
  });
  return h(
    'div',
    { class: 'f-field f-check', 'data-path': ctx.path },
    h('label', { for: id }, box, h('span', {}, labelOf(key, schema))),
  );
}

function objectFields(schema: Schema, value: Record<string, unknown>, ctx: Ctx): HTMLElement[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([key, sub]) => {
    if (sub.const !== undefined) return []; // fixed values (e.g. a slide's kind) are not editable
    return [
      field(
        key,
        sub,
        () => value[key],
        (v) => {
          if (v === undefined) delete value[key];
          else value[key] = v;
        },
        { path: `${ctx.path}.${key}`, changed: ctx.changed },
        !required.has(key),
      ),
    ];
  });
}

/** The schema that applies to this value (for lists that mix kinds, like slides). */
function variantFor(schema: Schema, value: unknown): Schema {
  if (!schema.anyOf) return schema;
  const kind = (value as Record<string, unknown> | null)?.kind;
  return schema.anyOf.find((s) => s.properties?.kind?.const === kind) ?? schema.anyOf[0];
}

/** A fixed-length pair or group shown side by side, e.g. a waypoint [latitude, longitude]. */
function tupleField(key: string, schema: Schema, get: Get, set: Set, ctx: Ctx): HTMLElement {
  const parts = schema.items as Schema[];
  let a = get();
  if (!Array.isArray(a)) {
    a = parts.map(defaultFor);
    set(a);
  }
  const arr = a as unknown[];
  return h(
    'div',
    { class: 'f-field f-tuple', 'data-path': ctx.path },
    h('span', { class: 'f-legend' }, labelOf(key, schema)),
    h(
      'div',
      { class: 'f-control' },
      ...parts.map((part, i) =>
        field(
          part.description ?? String(i + 1),
          part,
          () => arr[i],
          (v) => (arr[i] = v),
          {
            path: `${ctx.path}.${i}`,
            changed: ctx.changed,
          },
          false,
        ),
      ),
    ),
  );
}

/** An object with free keys and text values, e.g. captions by client name. Edited as name → text rows. */
function recordField(
  key: string,
  schema: Schema,
  get: Get,
  set: Set,
  ctx: Ctx,
  optional: boolean,
): HTMLElement {
  const rows = Object.entries((get() as Record<string, string> | undefined) ?? {});
  const list = h('div', { class: 'f-list' });
  const save = () => {
    const out = Object.fromEntries(rows.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v]));
    set(optional && !Object.keys(out).length ? undefined : out);
    ctx.changed();
  };
  const draw = () =>
    list.replaceChildren(
      ...rows.map((row, i) => {
        const k = h('input', { type: 'text', value: row[0], placeholder: 'Name', 'aria-label': 'Name' });
        const v = h('input', { type: 'text', value: row[1], placeholder: 'Text', 'aria-label': 'Text' });
        k.addEventListener('input', () => ((row[0] = k.value), save()));
        v.addEventListener('input', () => ((row[1] = v.value), save()));
        const remove = h('button', { type: 'button', class: 'f-icon f-danger', title: 'Remove' }, '✕');
        remove.addEventListener('click', () => (rows.splice(i, 1), save(), draw()));
        return h('div', { class: 'f-item f-item-flat f-pair' }, k, h('span', {}, '→'), v, remove);
      }),
    );
  const add = h('button', { type: 'button', class: 'f-add' }, '+ Add');
  add.addEventListener('click', () => {
    rows.push(['', '']);
    draw();
    (list.lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus();
  });
  draw();
  return h(
    'div',
    { class: 'f-field f-array', 'data-path': ctx.path },
    h(
      'div',
      { class: 'f-array-head' },
      h(
        'span',
        { class: 'f-legend' },
        labelOf(key, schema),
        optional ? h('span', { class: 'f-optional' }, ' (optional)') : null,
      ),
    ),
    list,
    h('div', { class: 'f-array-foot' }, add),
  );
}

function arrayField(key: string, schema: Schema, get: Get, set: Set, ctx: Ctx): HTMLElement {
  const items = (schema.items ?? {}) as Schema;
  const list = h('div', { class: 'f-list' });
  const search = h('input', { type: 'search', class: 'f-search', placeholder: 'Search this list…' });
  const count = h('span', { class: 'f-count' });
  const arr = () => {
    let a = get();
    if (!Array.isArray(a)) {
      a = [];
      set(a);
    }
    return a as unknown[];
  };
  const isObjects = Boolean(items.anyOf || (items.type === 'object' && items.properties));
  let dragFrom = -1;

  const draw = () => {
    const a = arr();
    count.textContent = `${a.length}`;
    search.hidden = a.length < 10;
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(
      ...a.map((value, i) => {
        const path = `${ctx.path}.${i}`;
        const sub = variantFor(items, value);
        const up = h('button', { type: 'button', class: 'f-icon', title: 'Move up', disabled: i === 0 }, '↑');
        const down = h(
          'button',
          { type: 'button', class: 'f-icon', title: 'Move down', disabled: i === a.length - 1 },
          '↓',
        );
        const remove = h('button', { type: 'button', class: 'f-icon f-danger', title: 'Remove' }, '✕');
        const move = (to: number) => {
          const [it] = a.splice(i, 1);
          a.splice(to, 0, it);
          ctx.changed();
          draw();
        };
        up.addEventListener('click', () => move(i - 1));
        down.addEventListener('click', () => move(i + 1));
        remove.addEventListener('click', () => {
          if (isObjects && !confirm(`Remove "${itemTitle(value, i)}"?`)) return;
          a.splice(i, 1);
          ctx.changed();
          draw();
        });
        const tools = h('span', { class: 'f-tools' }, up, down, remove);
        let row: HTMLElement;
        if (isObjects) {
          const kind = (value as Record<string, unknown>)?.kind;
          const title = h('span', { class: 'f-item-title' }, itemTitle(value, i));
          const summary = h(
            'summary',
            {},
            h('span', { class: 'f-grip', title: 'Drag to reorder' }, '⋮⋮'),
            title,
            typeof kind === 'string' ? h('span', { class: 'f-kind' }, kind) : null,
            tools,
          );
          const body = h('div', { class: 'f-item-body' });
          row = h('details', { class: 'f-item', 'data-path': path }, summary, body);
          // Build the fields only when opened (long lists stay fast).
          row.addEventListener('toggle', () => {
            if ((row as HTMLDetailsElement).open && !body.childElementCount)
              body.append(
                ...objectFields(sub, value as Record<string, unknown>, {
                  path,
                  changed: () => {
                    title.textContent = itemTitle(value, i);
                    ctx.changed();
                  },
                }),
              );
          });
        } else {
          row = h(
            'div',
            { class: 'f-item f-item-flat', 'data-path': path },
            h('span', { class: 'f-grip', title: 'Drag to reorder' }, '⋮⋮'),
            field(
              String(i + 1),
              { ...sub, description: undefined },
              () => a[i],
              (v) => (a[i] = v),
              { path, changed: ctx.changed },
              false,
            ),
            tools,
          );
        }
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
          dragFrom = i;
          e.dataTransfer?.setData('text/plain', String(i));
          row.classList.add('f-dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('f-dragging'));
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          row.classList.add('f-dropzone');
        });
        row.addEventListener('dragleave', () => row.classList.remove('f-dropzone'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('f-dropzone');
          if (dragFrom < 0 || dragFrom === i) return;
          const [it] = a.splice(dragFrom, 1);
          a.splice(i, 0, it);
          dragFrom = -1;
          ctx.changed();
          draw();
        });
        if (q && !JSON.stringify(value).toLowerCase().includes(q)) row.hidden = true;
        return row;
      }),
    );
  };

  // Adding: lists that mix kinds (slides) ask which kind first.
  const addBtn = h('button', { type: 'button', class: 'f-add' }, '+ Add');
  const kindSelect = items.anyOf
    ? h(
        'select',
        { class: 'f-add-kind', 'aria-label': 'Kind to add' },
        ...items.anyOf.map((s, k) =>
          h('option', { value: String(k) }, s.properties?.kind?.const ?? `Kind ${k + 1}`),
        ),
      )
    : null;
  addBtn.addEventListener('click', () => {
    const sub = items.anyOf ? items.anyOf[Number(kindSelect!.value)] : items;
    const a = arr();
    a.push(defaultFor(sub));
    ctx.changed();
    search.value = '';
    draw();
    const last = list.lastElementChild as HTMLDetailsElement | null;
    if (last?.tagName === 'DETAILS') last.open = true;
    last?.scrollIntoView({ block: 'nearest' });
  });
  search.addEventListener('input', draw);
  draw();

  return h(
    'div',
    { class: 'f-field f-array', 'data-path': ctx.path },
    h(
      'div',
      { class: 'f-array-head' },
      h('span', { class: 'f-legend' }, labelOf(key, schema), ' ', count),
      search,
    ),
    list,
    h('div', { class: 'f-array-foot' }, kindSelect, addBtn),
  );
}

export function field(
  key: string,
  schema: Schema,
  get: Get,
  set: Set,
  ctx: Ctx,
  optional: boolean,
): HTMLElement {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.anyOf && !types[0]) {
    // Either/or plain values (e.g. a page path or a web link): one text box that accepts both.
    if (schema.anyOf.every((s) => s.type === 'string'))
      return stringField(key, { type: 'string', description: schema.description }, get, set, ctx, optional);
    return objectGroup(key, variantFor(schema, get()), get, set, ctx);
  }
  if (types.includes('array') && Array.isArray(schema.items)) return tupleField(key, schema, get, set, ctx);
  if (types.includes('array')) return arrayField(key, schema, get, set, ctx);
  if (types.includes('object') && !schema.properties && schema.additionalProperties)
    return recordField(key, schema, get, set, ctx, optional);
  if (types.includes('object')) return objectGroup(key, schema, get, set, ctx);
  if (types.includes('boolean')) return booleanField(key, schema, get, set, ctx);
  if (types.includes('number') || types.includes('integer'))
    return numberOrTextField(key, schema, get, set, ctx, optional);
  return stringField(key, schema, get, set, ctx, optional);
}

function objectGroup(key: string, schema: Schema, get: Get, set: Set, ctx: Ctx): HTMLElement {
  let value = get() as Record<string, unknown> | undefined;
  if (!value || typeof value !== 'object') {
    value = defaultFor(schema) as Record<string, unknown>;
    set(value);
  }
  return h(
    'fieldset',
    { class: 'f-group', 'data-path': ctx.path },
    h('legend', {}, labelOf(key, schema)),
    ...objectFields(schema, value, ctx),
  );
}

/** The form for a whole section. `value` is edited in place; `changed` is called after every edit. */
export function sectionForm(
  key: string,
  schema: Schema,
  value: { current: unknown },
  changed: () => void,
): HTMLElement {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const ctx = { path: key, changed };
  if (types.includes('object') && schema.properties) {
    return h(
      'div',
      { class: 'f-form' },
      ...objectFields(schema, value.current as Record<string, unknown>, ctx),
    );
  }
  return h(
    'div',
    { class: 'f-form' },
    field(
      key,
      { ...schema, description: undefined },
      () => value.current,
      (v) => (value.current = v),
      ctx,
      false,
    ),
  );
}

/**
 * Opens the collapsed list items on the way to a field (e.g. "products.3.image") and returns the closest
 * element that is shown for it, so an error can be pointed at.
 */
export function revealPath(root: HTMLElement, path: string): HTMLElement | null {
  const parts = path.split('.');
  let found: HTMLElement | null = null;
  for (let i = 1; i <= parts.length; i++) {
    const el = root.querySelector<HTMLElement>(`[data-path="${CSS.escape(parts.slice(0, i).join('.'))}"]`);
    if (!el) continue;
    found = el;
    if (el instanceof HTMLDetailsElement && !el.open) {
      el.hidden = false;
      el.open = true;
      el.dispatchEvent(new Event('toggle')); // builds the fields right away
    }
  }
  return found;
}
