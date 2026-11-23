/**
 * The admin page (/admin): sign in, edit each section of the site, save drafts, publish, see history,
 * read meeting notes and manage admin logins. Every login is an admin.
 *
 * Drafts are saved per section and are not visible on the site until "Publish" (which checks the whole
 * site first). The forms are built from the content schema, see form.ts.
 */
import { api, type SessionUser } from '../lib/api';
import { h } from '../lib/dom';
import { revealPath, sectionForm, type Schema } from './form';
import './admin.css';

type SectionRow = {
  key: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  changed: boolean;
};
type SectionData = { key: string; draft: unknown; published: unknown; version: number; updatedAt: string };
type Version = { id: number; note: string; publishedAt: string; publishedBy: string | null };
type Note = {
  id: number;
  visitor: string;
  company: string;
  body: string;
  updatedAt: string;
  createdByEmail: string | null;
};
type Admin = {
  id: number;
  email: string;
  name: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};
type Issue = { path: string; message: string };

const root = document.getElementById('admin')!;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'never';

let me: SessionUser | null = null;
let schema: { sections: string[]; schema: Schema } | null = null;
let sections: SectionRow[] = [];
/** True while the open form has changes that are not saved as a draft. */
let dirty = false;

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

const leaveOk = () => !dirty || confirm('You have unsaved changes. Leave without saving?');

// ---------- Toasts ----------
const toasts = h('div', { class: 'a-toasts', 'aria-live': 'polite' });
function toast(text: string, tone: 'ok' | 'bad' | '' = '') {
  const t = h('div', { class: `a-toast ${tone}` }, text);
  toasts.append(t);
  setTimeout(() => t.remove(), tone === 'bad' ? 7000 : 3500);
}

// ---------- Sign in ----------
function signInScreen(message = '') {
  const email = h('input', { id: 'a-email', type: 'email', autocomplete: 'username', required: true });
  const password = h('input', {
    id: 'a-password',
    type: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const error = h('p', { class: 'a-error', role: 'alert' }, message);
  const btn = h('button', { type: 'submit', class: 'a-btn a-primary' }, 'Sign in');
  const form = h(
    'form',
    { class: 'a-card a-auth' },
    h('h1', {}, 'KJS admin'),
    h('p', { class: 'a-muted' }, 'Sign in to edit the website.'),
    h('label', { for: 'a-email' }, 'Email', email),
    h('label', { for: 'a-password' }, 'Password', password),
    error,
    btn,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    error.textContent = '';
    const res = await api<{ user: SessionUser }>('POST', '/api/auth/login', {
      email: email.value,
      password: password.value,
    });
    btn.disabled = false;
    if (!res.ok) {
      error.textContent = res.status === 0 ? 'No connection.' : (res.data.error ?? 'Could not sign in.');
      return;
    }
    me = res.data.user;
    if (me.mustChangePassword) passwordScreen(password.value);
    else void start();
  });
  root.replaceChildren(h('main', { class: 'a-center' }, form), toasts);
  email.focus();
}

function passwordForm(onDone: () => void, knownCurrent = ''): HTMLFormElement {
  const current = h('input', {
    id: 'a-current',
    type: 'password',
    autocomplete: 'current-password',
    value: knownCurrent,
  });
  const next = h('input', { id: 'a-new', type: 'password', autocomplete: 'new-password', minlength: 10 });
  const again = h('input', { id: 'a-again', type: 'password', autocomplete: 'new-password' });
  const error = h('p', { class: 'a-error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'a-btn a-primary' }, 'Change password');
  const form = h(
    'form',
    { class: 'a-pw' },
    h('label', { for: 'a-current', hidden: Boolean(knownCurrent) }, 'Current password', current),
    h('label', { for: 'a-new' }, 'New password (at least 10 characters)', next),
    h('label', { for: 'a-again' }, 'New password again', again),
    error,
    btn,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (next.value !== again.value) return void (error.textContent = 'The two new passwords are different.');
    btn.disabled = true;
    const res = await api<{ user: SessionUser }>('POST', '/api/auth/change-password', {
      currentPassword: current.value,
      newPassword: next.value,
    });
    btn.disabled = false;
    if (!res.ok) return void (error.textContent = res.data.error ?? 'Could not change the password.');
    me = res.data.user;
    form.reset();
    toast('Password changed.', 'ok');
    onDone();
  });
  return form;
}

function passwordScreen(knownCurrent: string) {
  const card = h(
    'div',
    { class: 'a-card a-auth' },
    h('h1', {}, 'Choose your password'),
    h(
      'p',
      { class: 'a-muted' },
      'This is your first sign-in. Please replace the starting password with your own.',
    ),
    passwordForm(() => void start(), knownCurrent),
  );
  root.replaceChildren(h('main', { class: 'a-center' }, card), toasts);
  (card.querySelector('#a-new') as HTMLInputElement).focus();
}

// ---------- Layout ----------
const nav = h('nav', { class: 'a-nav', 'aria-label': 'Admin' });
const main = h('main', { class: 'a-main' });
const publishBtn = h('button', { type: 'button', class: 'a-btn a-primary' }, 'Publish');
const menuBtn = h(
  'button',
  { type: 'button', class: 'a-btn a-menu', 'aria-label': 'Menu', 'aria-expanded': 'false' },
  '☰',
);
let current = '';

function shell() {
  const signOut = h('button', { type: 'button', class: 'a-btn' }, 'Sign out');
  signOut.addEventListener('click', async () => {
    if (!leaveOk()) return;
    dirty = false;
    await api('POST', '/api/auth/logout');
    me = null;
    signInScreen();
  });
  publishBtn.onclick = () => void publishDialog();
  menuBtn.onclick = () => {
    const open = !document.body.classList.contains('a-nav-open');
    document.body.classList.toggle('a-nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  root.replaceChildren(
    h(
      'header',
      { class: 'a-top' },
      menuBtn,
      h('strong', { class: 'a-brand' }, 'KJS admin'),
      h('a', { class: 'a-btn a-ghost', href: '/', target: '_blank', rel: 'noopener' }, 'View site ↗'),
      h('span', { class: 'a-spacer' }),
      h('span', { class: 'a-who' }, me!.email),
      publishBtn,
      signOut,
    ),
    h('div', { class: 'a-body' }, nav, main),
    toasts,
  );
}

const sectionLabel = (key: string) => schema?.schema.properties?.[key]?.description ?? key;

function renderNav() {
  const item = (id: string, label: string, extra?: Node) => {
    const b = h(
      'button',
      { type: 'button', class: 'a-nav-item', 'aria-current': current === id ? 'page' : undefined },
      label,
      extra,
    );
    b.addEventListener('click', () => go(id));
    return b;
  };
  const changed = sections.filter((s) => s.changed).length;
  publishBtn.textContent = changed ? `Publish (${changed})` : 'Publish';
  publishBtn.classList.toggle('a-attention', changed > 0);
  nav.replaceChildren(
    h('p', { class: 'a-nav-head' }, 'Content'),
    ...sections.map((s) =>
      item(
        `section:${s.key}`,
        sectionLabel(s.key),
        s.changed ? h('span', { class: 'a-dot', title: 'Draft not published yet' }) : undefined,
      ),
    ),
    h('p', { class: 'a-nav-head' }, 'Site'),
    item('history', 'History'),
    item('notes', 'Meeting notes'),
    item('admins', 'Admins'),
    item('account', 'My password'),
  );
}

async function refreshSections() {
  const res = await api<{ sections: SectionRow[] }>('GET', '/api/admin/sections');
  if (res.ok) sections = res.data.sections;
  renderNav();
}

function go(id: string) {
  if (id === current) return;
  if (!leaveOk()) return;
  dirty = false;
  current = id;
  document.body.classList.remove('a-nav-open');
  history.replaceState(null, '', `#${id}`);
  renderNav();
  main.scrollTop = 0;
  if (id.startsWith('section:')) void sectionPage(id.slice(8));
  else if (id === 'history') void historyPage();
  else if (id === 'notes') void notesPage();
  else if (id === 'admins') void adminsPage();
  else accountPage();
}

const loading = () => main.replaceChildren(h('p', { class: 'a-muted a-pad' }, 'Loading…'));
const failed = (msg?: string) =>
  main.replaceChildren(h('p', { class: 'a-error a-pad' }, msg ?? 'Could not load this page.'));

// ---------- Section editor ----------
async function sectionPage(key: string) {
  loading();
  const res = await api<SectionData>('GET', `/api/admin/sections/${key}`);
  if (current !== `section:${key}`) return;
  if (!res.ok) return failed(res.data.error);
  const sectionSchema = schema!.schema.properties![key];
  let version = res.data.version;
  const value = { current: structuredClone(res.data.draft) };
  let saved = JSON.stringify(value.current);
  const published = JSON.stringify(res.data.published);

  const status = h('span', { class: 'a-status' });
  const errors = h('div', { class: 'a-issues', hidden: true });
  const save = h('button', { type: 'button', class: 'a-btn a-primary' }, 'Save draft');
  const discard = h('button', { type: 'button', class: 'a-btn' }, 'Undo unpublished changes');

  const refreshStatus = () => {
    dirty = JSON.stringify(value.current) !== saved;
    save.disabled = !dirty;
    discard.hidden = dirty || saved === published;
    status.textContent = dirty
      ? 'Unsaved changes'
      : saved === published
        ? 'Same as the live site'
        : 'Draft saved · not published yet';
    status.dataset.tone = dirty ? 'warn' : saved === published ? '' : 'draft';
  };

  const showIssues = (issues: Issue[]) => {
    form.querySelectorAll('.f-invalid-server').forEach((el) => el.classList.remove('f-invalid-server'));
    errors.hidden = !issues.length;
    errors.replaceChildren(
      h('strong', {}, 'Please fix these before saving:'),
      h(
        'ul',
        {},
        ...issues.map((i) => {
          const link = h(
            'button',
            { type: 'button', class: 'a-link' },
            `${
              i.path
                .split('.')
                .slice(1)
                .map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : p))
                .join(' › ') || 'Section'
            }: ${i.message}`,
          );
          link.addEventListener('click', () => {
            const el = revealPath(form, i.path);
            el?.classList.add('f-invalid-server');
            el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            (el?.querySelector('input, textarea, select') as HTMLElement | null)?.focus({
              preventScroll: true,
            });
          });
          return h('li', {}, link);
        }),
      ),
    );
  };

  const form = sectionForm(key, sectionSchema, value, refreshStatus);

  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = 'Saving…';
    const r = await api<{ version: number; details?: Issue[] }>('PUT', `/api/admin/sections/${key}`, {
      data: value.current,
      version,
    });
    if (r.ok) {
      version = r.data.version;
      saved = JSON.stringify(value.current);
      showIssues([]);
      refreshStatus();
      toast('Draft saved. Publish when you are ready.', 'ok');
      await refreshSections();
      return;
    }
    refreshStatus();
    if (r.status === 400 && Array.isArray(r.data.details)) {
      showIssues(r.data.details);
      errors.scrollIntoView({ block: 'nearest' });
    } else toast(r.data.error ?? 'Could not save.', 'bad');
  });

  discard.addEventListener('click', async () => {
    if (
      !confirm(
        `Undo all unpublished changes in "${sectionLabel(key)}"? The live version will be loaded back.`,
      )
    )
      return;
    const r = await api('POST', `/api/admin/sections/${key}/discard`);
    if (!r.ok) return toast(r.data.error ?? 'Could not undo.', 'bad');
    toast('Back to the live version.', 'ok');
    dirty = false;
    current = '';
    await refreshSections();
    go(`section:${key}`);
  });

  main.replaceChildren(
    h(
      'div',
      { class: 'a-page' },
      h(
        'div',
        { class: 'a-bar' },
        h('div', {}, h('h1', {}, sectionLabel(key)), status),
        h('div', { class: 'a-actions' }, discard, save),
      ),
      errors,
      form,
    ),
  );
  refreshStatus();
}

// ---------- Publish ----------
async function publishDialog() {
  if (dirty) return toast('Save your draft first, then publish.', 'bad');
  const changed = sections.filter((s) => s.changed);
  if (!changed.length) return toast('Nothing to publish: the drafts are the same as the live site.');
  const note = h('input', {
    id: 'a-note',
    type: 'text',
    maxlength: 200,
    placeholder: 'e.g. New product photos',
  });
  const confirmBtn = h('button', { type: 'submit', class: 'a-btn a-primary' }, 'Publish now');
  const cancel = h('button', { type: 'button', class: 'a-btn' }, 'Cancel');
  const error = h('div', { class: 'a-error', role: 'alert' });
  const dialog = h(
    'dialog',
    { class: 'a-dialog' },
    h(
      'form',
      { method: 'dialog' },
      h('h2', {}, 'Publish to the live site'),
      h('p', {}, 'These sections will go live:'),
      h('ul', {}, ...changed.map((s) => h('li', {}, sectionLabel(s.key)))),
      h('label', { for: 'a-note' }, 'What changed? (optional, shown in History)', note),
      error,
      h('div', { class: 'a-actions' }, cancel, confirmBtn),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  cancel.addEventListener('click', () => dialog.close());
  dialog.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    confirmBtn.disabled = true;
    const r = await api('POST', '/api/admin/publish', { note: note.value });
    confirmBtn.disabled = false;
    if (!r.ok) {
      const details = (r.data as { details?: Issue[] }).details ?? [];
      error.replaceChildren(
        h('strong', {}, r.data.error ?? 'Could not publish.'),
        ...details.slice(0, 8).map((d) => h('div', {}, `${d.path}: ${d.message}`)),
      );
      return;
    }
    dialog.close();
    toast('Published. The live site updates within a minute.', 'ok');
    await refreshSections();
    if (current.startsWith('section:')) {
      const k = current;
      current = '';
      go(k);
    }
  });
  dialog.showModal();
  note.focus();
}

// ---------- History ----------
async function historyPage() {
  loading();
  const res = await api<{ versions: Version[] }>('GET', '/api/admin/versions');
  if (current !== 'history') return;
  if (!res.ok) return failed(res.data.error);
  main.replaceChildren(
    h(
      'div',
      { class: 'a-page' },
      h(
        'div',
        { class: 'a-bar' },
        h(
          'div',
          {},
          h('h1', {}, 'History'),
          h(
            'p',
            { class: 'a-muted' },
            'Every publish is kept. Restore puts an older version back on the live site.',
          ),
        ),
      ),
      h(
        'div',
        { class: 'a-table' },
        ...res.data.versions.map((v, i) => {
          const restore = h('button', { type: 'button', class: 'a-btn' }, 'Restore');
          restore.hidden = i === 0;
          restore.addEventListener('click', async () => {
            if (
              !confirm(
                `Put the version from ${when(v.publishedAt)} back on the live site? Unpublished drafts will be replaced.`,
              )
            )
              return;
            const r = await api('POST', `/api/admin/versions/${v.id}/restore`);
            if (!r.ok) return toast(r.data.error ?? 'Could not restore.', 'bad');
            toast('Restored and live.', 'ok');
            await refreshSections();
            current = '';
            go('history');
          });
          return h(
            'div',
            { class: 'a-row' },
            h(
              'div',
              {},
              h('strong', {}, v.note || (i === 0 ? 'Live now' : 'Published')),
              h('span', { class: 'a-muted' }, `${when(v.publishedAt)} · ${v.publishedBy ?? 'setup'}`),
            ),
            i === 0 ? h('span', { class: 'a-badge' }, 'Live') : restore,
          );
        }),
      ),
    ),
  );
}

// ---------- Meeting notes ----------
async function notesPage() {
  loading();
  const res = await api<{ notes: Note[] }>('GET', '/api/admin/notes');
  if (current !== 'notes') return;
  if (!res.ok) return failed(res.data.error);
  const search = h('input', { type: 'search', class: 'a-search', placeholder: 'Search notes…' });
  const list = h('div', { class: 'a-notes' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = res.data.notes.filter(
      (n) => !q || `${n.visitor} ${n.company} ${n.body}`.toLowerCase().includes(q),
    );
    list.replaceChildren(
      ...(rows.length
        ? rows.map((n) => {
            const del = h('button', { type: 'button', class: 'a-btn a-danger' }, 'Delete');
            del.addEventListener('click', async () => {
              if (!confirm('Delete this note for everyone?')) return;
              const r = await api('DELETE', `/api/admin/notes/${n.id}`);
              if (!r.ok) return toast(r.data.error ?? 'Could not delete.', 'bad');
              res.data.notes = res.data.notes.filter((x) => x.id !== n.id);
              draw();
            });
            return h(
              'article',
              { class: 'a-card a-note' },
              h(
                'header',
                {},
                h(
                  'div',
                  {},
                  h('strong', {}, n.visitor || 'No visitor name'),
                  n.company ? h('span', {}, ` · ${n.company}`) : null,
                ),
                del,
              ),
              h('p', { class: 'a-muted' }, `${when(n.updatedAt)} · ${n.createdByEmail ?? 'unknown'}`),
              h('div', { class: 'a-note-body' }, n.body || '(empty)'),
            );
          })
        : [
            h(
              'p',
              { class: 'a-muted' },
              q
                ? 'No notes match.'
                : 'No meeting notes yet. They are written from the Notes button on the site.',
            ),
          ]),
    );
  };
  search.addEventListener('input', draw);
  draw();
  main.replaceChildren(
    h('div', { class: 'a-page' }, h('div', { class: 'a-bar' }, h('h1', {}, 'Meeting notes'), search), list),
  );
}

// ---------- Admins ----------
async function adminsPage() {
  loading();
  const res = await api<{ users: Admin[] }>('GET', '/api/admin/users');
  if (current !== 'admins') return;
  if (!res.ok) return failed(res.data.error);

  const showPassword = (email: string, password: string) => {
    const box = h(
      'div',
      { class: 'a-card a-secret' },
      h('strong', {}, `Starting password for ${email}`),
      h('code', {}, password),
      h(
        'p',
        { class: 'a-muted' },
        'Shown only once. Give it to them; they choose their own password at first sign-in.',
      ),
    );
    main.querySelector('.a-page')!.insertBefore(box, main.querySelector('.a-table'));
  };

  const email = h('input', {
    id: 'a-new-email',
    type: 'email',
    placeholder: 'name@kjsindia.com',
    required: true,
  });
  const name = h('input', { id: 'a-new-name', type: 'text', placeholder: 'Name (optional)' });
  const add = h(
    'form',
    { class: 'a-inline' },
    email,
    name,
    h('button', { type: 'submit', class: 'a-btn a-primary' }, 'Add admin'),
  );
  add.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api<{ user: Admin; temporaryPassword: string }>('POST', '/api/admin/users', {
      email: email.value,
      name: name.value,
    });
    if (!r.ok) return toast(r.data.error ?? 'Could not add.', 'bad');
    current = '';
    go('admins');
    // wait for the page to redraw, then show the password
    const wait = setInterval(() => {
      if (main.querySelector('.a-table')) {
        clearInterval(wait);
        showPassword(r.data.user.email, r.data.temporaryPassword);
      }
    }, 50);
  });

  const rows = res.data.users.map((u) => {
    const reset = h('button', { type: 'button', class: 'a-btn' }, 'Reset password');
    const toggle = h('button', { type: 'button', class: 'a-btn' }, u.active ? 'Turn off' : 'Turn on');
    const remove = h('button', { type: 'button', class: 'a-btn a-danger' }, 'Remove');
    const isMe = u.id === me!.id;
    reset.addEventListener('click', async () => {
      if (!confirm(`Give ${u.email} a new starting password? They will be signed out everywhere.`)) return;
      const r = await api<{ temporaryPassword: string }>('POST', `/api/admin/users/${u.id}/reset-password`);
      if (!r.ok) return toast(r.data.error ?? 'Could not reset.', 'bad');
      showPassword(u.email, r.data.temporaryPassword);
    });
    toggle.addEventListener('click', async () => {
      const r = await api('PUT', `/api/admin/users/${u.id}`, { active: !u.active });
      if (!r.ok) return toast(r.data.error ?? 'Could not change.', 'bad');
      current = '';
      go('admins');
    });
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove ${u.email}? They will no longer be able to sign in.`)) return;
      const r = await api('DELETE', `/api/admin/users/${u.id}`);
      if (!r.ok) return toast(r.data.error ?? 'Could not remove.', 'bad');
      current = '';
      go('admins');
    });
    return h(
      'div',
      { class: `a-row ${u.active ? '' : 'a-off'}` },
      h(
        'div',
        {},
        h('strong', {}, u.email, isMe ? ' (you)' : ''),
        h(
          'span',
          { class: 'a-muted' },
          [
            u.name,
            u.active ? '' : 'turned off',
            u.mustChangePassword ? 'has not signed in yet' : `last sign-in ${when(u.lastLoginAt)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ),
      isMe ? h('span', {}) : h('div', { class: 'a-actions' }, reset, toggle, remove),
    );
  });

  main.replaceChildren(
    h(
      'div',
      { class: 'a-page' },
      h(
        'div',
        { class: 'a-bar' },
        h(
          'div',
          {},
          h('h1', {}, 'Admins'),
          h('p', { class: 'a-muted' }, 'Everyone here can edit and publish the site and read meeting notes.'),
        ),
      ),
      add,
      h('div', { class: 'a-table' }, ...rows),
    ),
  );
}

// ---------- My password ----------
function accountPage() {
  main.replaceChildren(
    h(
      'div',
      { class: 'a-page a-narrow' },
      h('div', { class: 'a-bar' }, h('h1', {}, 'My password')),
      h(
        'div',
        { class: 'a-card' },
        passwordForm(() => undefined),
      ),
    ),
  );
}

// ---------- Start ----------
async function start() {
  const s = await api<{ sections: string[]; schema: Schema }>('GET', '/api/admin/schema');
  if (!s.ok) return signInScreen(s.status === 401 ? '' : (s.data.error ?? 'Could not load.'));
  schema = s.data;
  shell();
  await refreshSections();
  const wanted = location.hash.slice(1);
  const valid = wanted.startsWith('section:')
    ? sections.some((x) => `section:${x.key}` === wanted)
    : ['history', 'notes', 'admins', 'account'].includes(wanted);
  current = '';
  go(valid ? wanted : `section:${sections[0]?.key ?? 'site'}`);
}

(async () => {
  const res = await api<{ user: SessionUser | null }>('GET', '/api/auth/me');
  me = res.ok ? res.data.user : null;
  if (!me) signInScreen(res.status === 0 ? 'No connection to the server.' : '');
  else if (me.role !== 'admin') signInScreen('This login is not an admin.');
  else if (me.mustChangePassword) passwordScreen('');
  else void start();
})();
