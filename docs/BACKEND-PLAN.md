# Backend plan

**Goal:** all site content (text, products, slides, images, pitches) lives in Neon and can be changed through an API. The admin page is built on top of that API afterwards.

**Stack:**

- One catch-all Vercel Function (`api/[...path].ts`) that routes every endpoint internally, because the free Vercel plan allows at most 12 functions.
- Neon Postgres through Drizzle, with a **dev** database for development and the **production** database for the live site.
- Zod checks that reuse `content/content.schema.ts`.
- Vercel Blob for files, uploaded straight from the browser (Vercel functions only accept 4.5 MB).
- Email and password login.

**Rules**

- After go-live, **the database is the source of truth**. `content/content.json` is only for seeding and offline use. Refresh it with `npm run db:export` before each deploy.
- Never point local development at the production database. Use the dev database in `.env`.
- Every phase ends with a passing build and tests, checks at several screen sizes, a push to `presentation-v` and `main`, a deploy, and a note in `docs/notes/<you>.md`.

## Phases

| #   | Phase                                                                                                 | Estimate   | Done when                                               |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| 0   | Setup (owner): admin email, Blob store, decisions                                                     | 20 min     | Values in `.env` / Vercel                               |
| 1   | Database: Drizzle, tables, migrate / seed / export                                                    | 1 day      | Seed works twice on the dev database without duplicates |
| 2   | API: auth, sections with version check, publish, history, media tokens, users, schema endpoint, tests | 1.5–2 days | Vitest passes against the dev database                  |
| 3   | Site reads `/api/content` (live → last good copy → built-in copy)                                     | 0.5 day    | Site identical; still renders with the API off          |
| 4   | Media: direct-to-Blob uploads, resized in the browser                                                 | 0.5 day    | An uploaded image shows on the live site                |
| 5   | Mayora pitch rendered from data                                                                       | 2 days     | Every slide passes the size and overflow checks         |
| 6   | Meeting notes in the database (optional)                                                              | 0.5 day    | Staff can read saved notes                              |
| 7   | Go live: Vercel settings, migrate and seed production, full check                                     | 0.5 day    | Full check passes on the live site                      |

## Tables

- **users:** email, name, password hash, role (`admin` or `editor`), `must_change_password`, `session_version`.
- **sections:** one row per content section (`site`, `home`, `about`…), with `draft`, `published` and `version` (to protect against two people saving at once).
- **versions:** a copy of all published content at each publish, used for rollback.
- **media:** uploaded files (link, type, size, alt text).
- **pitches:** client decks (`mayora`…), with draft, published and version.
- **login_attempts:** used to slow down repeated failed logins.
- **notes:** meeting notes (optional).

## Safety decisions

- **Concurrent edits:** every save sends the version it started from, and if someone saved in between, the API answers 409.
- **Logging users out:** removing a user, or resetting their password, increases `session_version`, which ends their existing logins.
- **Password resets:** there's no email service, so an admin resets the password and the user must change it at first login.
- **Deleting media:** a file that content still uses can't be deleted.
- **Speed after idle:** `/api/content` is cached, and the cached copy is served while it refreshes in the background.
