/** Meeting notes API: admins only, no duplicates on retry, any admin may change or delete a note. */
import { beforeAll, describe, expect, it } from 'vitest';
import { PASSWORDS, call, loginAs, resetDatabase } from './helpers';

let admin = '';
let editor = '';
let other = '';

beforeAll(async () => {
  await resetDatabase();
  admin = await loginAs('admin@test.local', PASSWORDS.admin);
  editor = await loginAs('editor@test.local', PASSWORDS.editor);
  // a third admin, created through the API
  const created = await call('POST', '/api/admin/users', {
    cookie: admin,
    body: { email: 'other@test.local' },
  });
  const first = await loginAs('other@test.local', created.data.temporaryPassword);
  other = (
    await call('POST', '/api/auth/change-password', {
      cookie: first,
      body: { currentPassword: created.data.temporaryPassword, newPassword: 'other-password-2026' },
    })
  ).cookie;
});

const note = (clientId: string, extra: Record<string, string> = {}) => ({
  clientId,
  visitor: 'R. Sharma',
  company: 'Sample Foods Ltd.',
  body: 'Interested in stick packs, 2 g fill.',
  ...extra,
});

describe('meeting notes', () => {
  it('are for logged-in staff only', async () => {
    expect((await call('GET', '/api/admin/notes')).status).toBe(401);
    expect((await call('POST', '/api/admin/notes', { body: note('note-anon-1') })).status).toBe(401);
  });

  it('saves a note, and saving it again updates the same note instead of duplicating it', async () => {
    const first = await call('POST', '/api/admin/notes', { cookie: editor, body: note('note-0001-abc') });
    expect(first.status).toBe(201);
    const again = await call('POST', '/api/admin/notes', {
      cookie: editor,
      body: note('note-0001-abc', { body: 'Interested in stick packs, 2 g fill. Follow up Monday.' }),
    });
    expect(again.status).toBe(200);
    expect(again.data.note.id).toBe(first.data.note.id);
    const list = (await call('GET', '/api/admin/notes', { cookie: editor })).data.notes;
    expect(list).toHaveLength(1);
    expect(list[0].body).toContain('Follow up Monday');
    expect(list[0].createdByEmail).toBe('editor@test.local');
  });

  it('rejects empty, oversized or badly identified notes', async () => {
    expect(
      (
        await call('POST', '/api/admin/notes', {
          cookie: editor,
          body: { clientId: 'note-empty-1', visitor: ' ', company: '', body: '  ' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/admin/notes', {
          cookie: editor,
          body: note('note-long-01', { body: 'x'.repeat(20_001) }),
        })
      ).status,
    ).toBe(400);
    expect((await call('POST', '/api/admin/notes', { cookie: editor, body: note('bad id!') })).status).toBe(
      400,
    );
  });

  it('lets any admin read, change and delete a note', async () => {
    const list = (await call('GET', '/api/admin/notes', { cookie: other })).data.notes;
    expect(list).toHaveLength(1);
    const edit = await call('POST', '/api/admin/notes', {
      cookie: other,
      body: note('note-0001-abc', { body: 'Updated by another admin' }),
    });
    expect(edit.status).toBe(200);
    expect((await call('DELETE', `/api/admin/notes/${list[0].id}`, { cookie: other })).status).toBe(200);
    expect((await call('GET', '/api/admin/notes', { cookie: editor })).data.notes).toHaveLength(0);
  });
});
