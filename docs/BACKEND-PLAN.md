# Backend plan (checklist)

**Goal:** the website's content (text, products, units, gallery, images) lives in Neon and staff edit it through the admin page.
**Not in scope:** presentation decks (e.g. `/pitches/mayora/`). They are temporary and get redesigned each time, so they stay as hand-made pages in `public/pitches/`. Only their **protection (PIN)** is handled by the backend.

**Stack:**

- One Vercel Function (`api/[...path].ts`) routes every endpoint, because the free Vercel plan allows at most 12 functions.
- Neon Postgres via Drizzle, with three databases: `db-02` (production), `kjs_dev` (local work) and `kjs_test` (tests).
- Zod checks from `content/content.schema.ts`.
- Vercel Blob for files.
- Email and password login.

**Rules**

- After go-live the database is the source of truth. `content.json` is only for seeding and fallback. Refresh it with `npm run db:export` before each deploy.
- Backend work goes to `presentation-v` only. `main` is updated only when the owner asks.
- Every step ends with a passing build and tests, a check at several screen sizes, a push, and a note in `docs/notes/<you>.md`.

## Checklist

### Phase 0: Setup

- [x] Dev and test databases (`kjs_dev`, `kjs_test`)
- [x] Admin logins: vineet@kjsindia.com, narender@kjsindia.com (they must change their password at first login)
- [ ] Owner: create the Vercel Blob store (Vercel → presentation-site-kjs → Storage → Create → Blob)
- [x] Owner: meeting notes go to the database (Phase 6)

### Phase 1: Database ✅

- [x] Tables: users, sections, versions, media, login_attempts, notes
- [x] Migrations, `db:seed` (safe to rerun), `db:export` (stable order)
- [x] Images may be `/media/...` or Vercel Blob links

### Phase 2: API ✅

- [x] Login, logout, "who am I", change password (forced at first login), wrong-password slowdown
- [x] Drafts per section, checked by the schema, with a version check (409 when someone else saved first)
- [x] Publish (whole-site check plus a history copy), history and restore, discard draft
- [x] Media: upload token, register, list, and delete (blocked while a file is in use)
- [x] Users (admins only): add, edit, reset password, remove; always one admin left
- [x] Field list for the admin page (`/api/admin/schema`); cross-site writes refused
- [x] Tests against `kjs_test`

### Phase 3: Site reads from the API ✅

- [x] Live API, then the last good copy saved in the browser, then the built-in copy (all schema-checked)
- [x] `npm run dev` / `preview` serve `/api` locally
- [x] Checked: database changes show on the page, and the page still renders with the database down

### Phase 4: Media uploads (~½ day, needs the Blob store)

- [ ] Upload straight from the browser to Blob (photos and videos up to 100 MB)
- [ ] Shrink large photos in the browser before uploading
- [ ] Confirm an uploaded photo can be used in content and shows on the site
- [ ] Tests

### Phase 5: Presentation protection (~½ day)

- [ ] The pitch PIN is checked **on the server** (`POST /api/pitch-unlock`), not in the page
- [ ] The PIN is kept in Vercel settings (`PITCH_PIN`, default 1305), not in any file; changing it needs no code change
- [ ] Vercel Routing Middleware serves `/pitches/...` only to browsers that have unlocked (signed cookie), so the slides and their links can't be opened by skipping the lock
- [ ] Wrong-PIN slowdown on the server (like login)
- [ ] The 4-digit auto-unlock screen stays the same for presenters
- [ ] Remove the unused `pitches` table and its media-usage check (migration)
- [ ] Tests, plus a check that opening a slide or photo link directly without the PIN is refused

### Phase 6: Meeting notes in the database ✅

- [x] Notes saved to the database (staff only); kept on the device first and resent when back online
- [x] No duplicates when a note is saved again (a note id from the browser)
- [x] Sign in, including the first-time password change, inside the notes panel
- [x] "Saved notes" list to reopen and edit earlier notes; only the writer or an admin can change or delete a note

### Phase 7: Go live (~½ day)

- [ ] Vercel settings: production database, session secret, Blob token, PIN; preview deployments use the dev database
- [ ] Migrate and seed the production database (`db-02`), and create the admins there
- [ ] Merge `presentation-v` into `main` (when the owner says so) and deploy
- [ ] Full check: every page at every size, login, save, publish, restore, upload, pitch PIN

### Phase 8: Admin page (~4–6 days)

- [ ] Login screen, including the forced password change
- [ ] Sidebar of sections; forms built from `/api/admin/schema`
- [ ] Image and video upload, drag to reorder, Save draft / Publish / Discard
- [ ] History with one-click restore; "someone else changed this" warnings
- [ ] Users page (admins only)
