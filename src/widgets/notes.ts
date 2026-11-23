/**
 * Meeting notes: opened from the header. A small panel in the bottom-right corner that can go full screen.
 *
 * - Every save is kept on this device first (so nothing is lost if the connection drops).
 * - When a staff member is signed in, the note is also saved to the database (POST /api/admin/notes).
 *   Each note has its own id from the browser, so saving again updates it instead of making a copy.
 * - If the database can't be reached, the note is marked "waiting" and sent again when the connection returns.
 * - "Saved notes" lists earlier notes (staff only) to reopen and edit them.
 * - "New note" never throws away a note that hasn't reached the database yet.
 */
import { api, type SessionUser } from '../lib/api';
import { h } from '../lib/dom';
import { icon } from '../lib/icons';

const STORAGE_KEY = 'kjs-notes';

type Draft = { clientId: string; visitor: string; company: string; notes: string; pending: boolean };
type SavedNote = {
  id: number;
  clientId: string | null;
  visitor: string;
  company: string;
  body: string;
  updatedAt: string;
  createdByEmail: string | null;
};

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const emptyDraft = (): Draft => ({ clientId: newId(), visitor: '', company: '', notes: '', pending: false });
const hasText = (d: Pick<Draft, 'visitor' | 'company' | 'notes'>) =>
  Boolean(d.visitor.trim() || d.company.trim() || d.notes.trim());

function readDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Draft>;
    const draft = { ...emptyDraft(), ...raw };
    // notes saved before the database existed have no id yet: give them one and send them on the next save
    if (!raw.clientId) draft.pending = hasText(draft);
    return draft;
  } catch {
    return emptyDraft();
  }
}

function writeDraft(draft: Draft): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export type NotesPanel = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  hasNotes: () => boolean;
  onSaved: (listener: () => void) => void;
};

export function notesPanel(): { element: HTMLElement; api: NotesPanel } {
  const savedListeners: (() => void)[] = [];
  let draft = readDraft();
  let user: SessionUser | null = null;
  let userChecked = false;

  // ---------- Note editor ----------
  const textField = (id: string, label: string, placeholder: string) => {
    const input = h('input', { id: `notes-${id}`, type: 'text', placeholder, autocomplete: 'off' });
    return { input, label: h('label', { for: `notes-${id}` }, label, input) };
  };
  const visitor = textField('visitor', 'Visitor', 'e.g. R. Sharma');
  const company = textField('company', 'Company', 'e.g. Sample Foods Ltd.');
  const textarea = h('textarea', {
    id: 'notes-notes',
    placeholder: 'Interested in stick packs, 2 g fill, about 50,000 units a month…',
  });
  const status = h('span', { class: 'notes-status', role: 'status' });
  const save = h('button', { type: 'button', class: 'primary' }, 'Save notes');
  const newNote = h('button', { type: 'button', class: 'notes-link' }, '+ New note');
  const sizeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Full screen notes' });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close notes' }, icon('x'));

  const editView = h(
    'div',
    { class: 'notes-view notes-edit' },
    h('div', { class: 'notes-who' }, visitor.label, company.label),
    h('label', { class: 'notes-grow', for: 'notes-notes' }, 'Notes', textarea),
    h('div', { class: 'notes-row' }, status, save),
  );

  // ---------- Sign in (also the first-time password change) ----------
  const email = h('input', {
    id: 'notes-email',
    type: 'email',
    autocomplete: 'username',
    placeholder: 'name@kjsindia.com',
  });
  const password = h('input', { id: 'notes-password', type: 'password', autocomplete: 'current-password' });
  const newPassword = h('input', {
    id: 'notes-new-password',
    type: 'password',
    autocomplete: 'new-password',
  });
  const newPasswordRow = h(
    'label',
    { for: 'notes-new-password', hidden: true },
    'Choose your own password (10+ characters)',
    newPassword,
  );
  const signInError = h('p', { class: 'notes-error', role: 'alert' });
  const signInBtn = h('button', { type: 'submit', class: 'primary' }, 'Sign in');
  const cancelSignIn = h('button', { type: 'button', class: 'notes-link' }, '← Back to the note');
  const signInView = h(
    'form',
    { class: 'notes-view notes-signin', hidden: true },
    h('p', { class: 'notes-hint' }, 'Sign in with your KJS staff login to save notes to the database.'),
    h('label', { for: 'notes-email' }, 'Email', email),
    h('label', { for: 'notes-password' }, 'Password', password),
    newPasswordRow,
    signInError,
    h('div', { class: 'notes-row' }, cancelSignIn, signInBtn),
  );

  // ---------- Saved notes ----------
  const list = h('div', { class: 'notes-list' });
  const backFromList = h('button', { type: 'button', class: 'notes-link' }, '← Back to the note');
  const listView = h(
    'div',
    { class: 'notes-view notes-saved', hidden: true },
    h('div', { class: 'notes-row' }, h('strong', {}, 'Saved notes'), backFromList),
    list,
  );

  const account = h('div', { class: 'notes-account' });

  const panel = h(
    'section',
    { class: 'notes', 'aria-label': 'Meeting notes', hidden: true },
    h(
      'header',
      {},
      h('h2', {}, 'Meeting notes'),
      h('div', { class: 'notes-tools' }, newNote, sizeBtn, closeBtn),
    ),
    editView,
    signInView,
    listView,
    account,
  );

  // ---------- Helpers ----------
  const signedIn = () => Boolean(user && !user.mustChangePassword);

  const show = (view: 'edit' | 'signin' | 'list') => {
    editView.hidden = view !== 'edit';
    signInView.hidden = view !== 'signin';
    listView.hidden = view !== 'list';
    newNote.hidden = view !== 'edit';
  };

  const fillEditor = () => {
    visitor.input.value = draft.visitor;
    company.input.value = draft.company;
    textarea.value = draft.notes;
  };

  const editorText = () => ({
    visitor: visitor.input.value,
    company: company.input.value,
    notes: textarea.value,
  });
  const editorChanged = () => {
    const t = editorText();
    return t.visitor !== draft.visitor || t.company !== draft.company || t.notes !== draft.notes;
  };

  const setStatus = (text: string, tone: '' | 'ok' | 'warn' = '') => {
    status.textContent = text;
    status.dataset.tone = tone;
  };

  const renderAccount = () => {
    if (signedIn()) {
      const listBtn = h('button', { type: 'button', class: 'notes-link' }, 'Saved notes');
      const signOut = h('button', { type: 'button', class: 'notes-link' }, 'Sign out');
      listBtn.addEventListener('click', () => void openList());
      signOut.addEventListener('click', async () => {
        await api('POST', '/api/auth/logout');
        user = null;
        renderAccount();
        show('edit');
      });
      account.replaceChildren(h('span', {}, `Signed in as ${user!.email}`), listBtn, signOut);
    } else {
      const signIn = h('button', { type: 'button', class: 'notes-link' }, 'Sign in to save online');
      signIn.addEventListener('click', () => {
        show('signin');
        email.focus();
      });
      account.replaceChildren(h('span', {}, 'Saved on this device only'), signIn);
    }
  };

  // ---------- Saving ----------
  /** Sends the current note to the database if it is waiting. Returns true when it is safely stored there. */
  async function sendToDatabase(): Promise<boolean> {
    if (!draft.pending) return true;
    if (!hasText(draft)) {
      draft.pending = false;
      writeDraft(draft);
      return true;
    }
    if (!signedIn()) return false;
    setStatus('Saving to the database…');
    const res = await api('POST', '/api/admin/notes', {
      clientId: draft.clientId,
      visitor: draft.visitor,
      company: draft.company,
      body: draft.notes,
    });
    if (res.ok) {
      draft.pending = false;
      writeDraft(draft);
      setStatus(`Saved to the database at ${time()}`, 'ok');
      return true;
    }
    if (res.status === 0) {
      setStatus('Saved on this device. It will go to the database when the connection is back.', 'warn');
    } else if (res.status === 401) {
      user = null;
      renderAccount();
      setStatus('Saved on this device. Sign in again to save it to the database.', 'warn');
    } else {
      setStatus(`Saved on this device only. ${res.data.error ?? 'The database refused it.'}`, 'warn');
    }
    return false;
  }

  async function saveNow(): Promise<boolean> {
    draft = { ...draft, ...editorText(), pending: true };
    if (!writeDraft(draft)) {
      setStatus('Could not save in this browser.', 'warn');
      return false;
    }
    savedListeners.forEach((l) => l());
    if (!signedIn()) {
      setStatus(`Saved on this device at ${time()}. Sign in to save it to the database.`);
      return false;
    }
    return sendToDatabase();
  }

  async function startNewNote() {
    if (editorChanged() || draft.pending) {
      const stored = await saveNow();
      if (!stored && hasText(draft)) {
        setStatus('This note is only on this device. Sign in and save it before starting a new one.', 'warn');
        return;
      }
    }
    draft = emptyDraft();
    writeDraft(draft);
    fillEditor();
    setStatus('New note started.');
    savedListeners.forEach((l) => l());
    visitor.input.focus();
  }

  // ---------- Saved notes list ----------
  async function openList() {
    show('list');
    list.replaceChildren(h('p', { class: 'notes-hint' }, 'Loading…'));
    const res = await api<{ notes: SavedNote[] }>('GET', '/api/admin/notes');
    if (!res.ok) {
      list.replaceChildren(h('p', { class: 'notes-error' }, res.data.error ?? 'Could not load saved notes.'));
      return;
    }
    if (!res.data.notes.length) {
      list.replaceChildren(h('p', { class: 'notes-hint' }, 'No saved notes yet.'));
      return;
    }
    list.replaceChildren(
      ...res.data.notes.map((n) => {
        const details = [n.visitor && n.company ? n.company : '', day(n.updatedAt), n.createdByEmail ?? '']
          .filter(Boolean)
          .join(' · ');
        const item = h(
          'button',
          { type: 'button', class: 'notes-item' },
          h('strong', {}, n.visitor || n.company || 'Untitled note'),
          h('span', {}, details),
        );
        item.addEventListener('click', async () => {
          if ((editorChanged() || draft.pending) && !(await saveNow()) && hasText(draft)) {
            show('edit');
            setStatus('Your current note could not reach the database yet, so it was kept open.', 'warn');
            return;
          }
          draft = {
            clientId: n.clientId ?? newId(),
            visitor: n.visitor,
            company: n.company,
            notes: n.body,
            pending: false,
          };
          writeDraft(draft);
          fillEditor();
          show('edit');
          setStatus(`Opened the note from ${day(n.updatedAt)}.`);
        });
        return item;
      }),
    );
  }

  // ---------- Sign-in form ----------
  signInView.addEventListener('submit', async (e) => {
    e.preventDefault();
    signInError.textContent = '';
    signInBtn.disabled = true;
    try {
      if (user?.mustChangePassword) {
        const res = await api<{ user: SessionUser }>('POST', '/api/auth/change-password', {
          currentPassword: password.value,
          newPassword: newPassword.value,
        });
        if (!res.ok) {
          signInError.textContent = res.data.error ?? 'Could not change the password.';
          return;
        }
        user = res.data.user;
      } else {
        const res = await api<{ user: SessionUser }>('POST', '/api/auth/login', {
          email: email.value,
          password: password.value,
        });
        if (!res.ok) {
          signInError.textContent =
            res.status === 0
              ? 'No connection. Your note is still saved on this device.'
              : (res.data.error ?? 'Could not sign in.');
          return;
        }
        user = res.data.user;
        if (user.mustChangePassword) {
          newPasswordRow.hidden = false;
          signInBtn.textContent = 'Set my password';
          signInError.textContent = 'First sign-in: please choose your own password.';
          newPassword.focus();
          return;
        }
      }
      password.value = '';
      newPassword.value = '';
      newPasswordRow.hidden = true;
      signInBtn.textContent = 'Sign in';
      renderAccount();
      show('edit');
      if (draft.pending) await sendToDatabase();
      else setStatus('Signed in. Saving now also goes to the database.', 'ok');
    } finally {
      signInBtn.disabled = false;
    }
  });
  cancelSignIn.addEventListener('click', () => show('edit'));
  backFromList.addEventListener('click', () => show('edit'));

  // ---------- Panel ----------
  const setSize = (full: boolean) => {
    panel.classList.toggle('full', full);
    sizeBtn.setAttribute('aria-label', full ? 'Shrink notes' : 'Full screen notes');
    sizeBtn.replaceChildren(icon(full ? 'minimize2' : 'maximize2'));
  };
  setSize(false);
  sizeBtn.addEventListener('click', () => setSize(!panel.classList.contains('full')));
  save.addEventListener('click', () => void saveNow());
  newNote.addEventListener('click', () => void startNewNote());
  window.addEventListener('online', () => void sendToDatabase());

  async function checkUser() {
    if (userChecked) return;
    userChecked = true;
    const res = await api<{ user: SessionUser | null }>('GET', '/api/auth/me');
    user = res.ok ? res.data.user : null;
    renderAccount();
    if (draft.pending) await sendToDatabase();
  }

  fillEditor();
  setStatus(draft.pending && hasText(draft) ? 'Saved on this device only.' : '');
  renderAccount();
  show('edit');

  const panelApi: NotesPanel = {
    open: () => {
      panel.hidden = false;
      visitor.input.focus();
      void checkUser();
    },
    close: () => {
      panel.hidden = true;
      setSize(false);
    },
    isOpen: () => !panel.hidden,
    hasNotes: () => hasText(readDraft()),
    onSaved: (listener) => savedListeners.push(listener),
  };
  closeBtn.addEventListener('click', panelApi.close);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    if (panel.classList.contains('full')) setSize(false);
    else panelApi.close();
  });

  return { element: panel, api: panelApi };
}
