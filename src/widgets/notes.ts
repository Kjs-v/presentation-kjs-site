/**
 * Meeting notes: opened from the header. A small panel in the bottom-right corner that can go full screen.
 * Saved only in this browser (localStorage) for now; later this can move to the database.
 */
import { h } from '../lib/dom';
import { icon } from '../lib/icons';

const STORAGE_KEY = 'kjs-notes';
const FIELDS = ['visitor', 'company', 'notes'] as const;
type Saved = Partial<Record<(typeof FIELDS)[number], string>>;

function read(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Saved;
  } catch {
    return {};
  }
}

export type NotesPanel = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  hasNotes: () => boolean;
  onSaved: (listener: () => void) => void;
};

export function notesPanel(): { element: HTMLElement; api: NotesPanel } {
  const savedListeners: (() => void)[] = [];
  const input = (id: string, label: string, placeholder: string) =>
    h('label', { for: `notes-${id}` }, label, h('input', { id: `notes-${id}`, type: 'text', placeholder }));

  const sizeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Full screen notes' });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close notes' }, icon('x'));
  const textarea = h('textarea', {
    id: 'notes-notes',
    placeholder: 'Interested in stick packs, 2 g fill, about 50,000 units a month…',
  });
  const status = h('span', { class: 'notes-status' }, 'Saved on this device only');
  const save = h('button', { type: 'button', class: 'primary' }, 'Save notes');

  const panel = h(
    'section',
    { class: 'notes', 'aria-label': 'Meeting notes', hidden: true },
    h('header', {}, h('h2', {}, 'Meeting notes'), h('div', { class: 'notes-tools' }, sizeBtn, closeBtn)),
    h(
      'div',
      { class: 'notes-who' },
      input('visitor', 'Visitor', 'e.g. R. Sharma'),
      input('company', 'Company', 'e.g. Sample Foods Ltd.'),
    ),
    h('label', { class: 'notes-grow', for: 'notes-notes' }, 'Notes', textarea),
    h('div', { class: 'notes-row' }, status, save),
  );

  const field = (id: string) => panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#notes-${id}`)!;
  const saved = read();
  FIELDS.forEach((id) => (field(id).value = saved[id] ?? ''));

  const setSize = (full: boolean) => {
    panel.classList.toggle('full', full);
    sizeBtn.setAttribute('aria-label', full ? 'Shrink notes' : 'Full screen notes');
    sizeBtn.replaceChildren(icon(full ? 'minimize2' : 'maximize2'));
  };
  setSize(false);
  sizeBtn.addEventListener('click', () => setSize(!panel.classList.contains('full')));

  const api: NotesPanel = {
    open: () => {
      panel.hidden = false;
      field('visitor').focus();
    },
    close: () => {
      panel.hidden = true;
      setSize(false);
    },
    isOpen: () => !panel.hidden,
    hasNotes: () => Object.values(read()).some(Boolean),
    onSaved: (listener) => savedListeners.push(listener),
  };
  closeBtn.addEventListener('click', api.close);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    if (panel.classList.contains('full')) setSize(false);
    else api.close();
  });

  save.addEventListener('click', () => {
    const data = Object.fromEntries(FIELDS.map((id) => [id, field(id).value]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      status.textContent = 'Saved on this device';
    } catch {
      status.textContent = 'Could not save in this browser';
    }
    savedListeners.forEach((l) => l());
  });

  return { element: panel, api };
}
