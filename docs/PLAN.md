# Project plan

**Goal:** a presentation website for KJS India where every text, image, product, slide, colour and link can be changed
by non-technical staff through an admin page, without touching code.

**Design reference:** https://kjs-india-presentation-review.enoshpilli07.chatgpt.site, the chosen design.

- Copy its layout, look and animations.
- Use only our own images and videos from `public/media/`, never its media.

## Tech stack

| Part                    | Tool                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Public site             | HTML/CSS/TypeScript, built with **Vite**, no framework                                       |
| Content shape           | **Zod** schema in `content/content.schema.ts`                                                |
| Admin page (phase 3)    | **React + Vite** at `/admin`, styled like Sveltia CMS                                        |
| API (phase 2)           | **Vercel Functions** (Node) in `api/`                                                        |
| Database (phase 2)      | **Neon Postgres** via **Drizzle ORM**                                                        |
| Images/videos (phase 2) | **Vercel Blob**                                                                              |
| Admin login             | Email + password, stored as bcrypt hashes, with an httpOnly session cookie. No GitHub login. |
| Hosting                 | **Vercel**, deployed from GitHub                                                             |

## Key rule: content is data, not code

- All content lives in `content/content.json` and follows `content/content.schema.ts`.
- Pages read content only through `src/lib/content.ts` → `loadContent()`.
- No text or image paths are hardcoded in pages, CSS or `index.html`.
- Colours come from `site.theme.palettes` (white / royal blue) as `--c-*` CSS variables. Fonts come from `site.theme`.

This rule is what lets us swap the JSON file for the database later, and generate the admin forms automatically.

## Phases

### Phase 1: Frontend (now)

1. Rebuild the chosen design in `src/`, page by page:
   - Home/About
   - Products (best sellers + all products)
   - Slides (`/show`)
   - Unit 1 and Unit 2
   - Gallery
2. Need a new field? Add it to the schema first, then to `content.json`, then use it in the UI.
3. `npm run build` must pass. It checks types, the content shape and that every media file exists.

### Phase 2: Backend

1. Create these tables in Neon:
   - `users`
   - `sections`: one JSON block per content section, validated with the same Zod schema
   - `media`
   - `versions`: published snapshots, used for rollback
2. Build the API:
   - `GET /api/content`: published content, cached
   - login and logout
   - save draft, publish and roll back
   - upload to Vercel Blob
   - manage users
3. Seed the database from `content/content.json`, then upload `public/media` to Blob.
4. Switch `loadContent()` to `fetch('/api/content')`.

The backend stays flexible: sections are stored as JSON and validated by the schema. Changing the frontend means
changing the schema, not the database.

### Phase 3: Admin page

- Sveltia-style layout: a sidebar of sections, forms, image upload, drag-to-reorder, Save draft, Publish and History.
- Forms are generated from `content.schema.ts`, using the `.describe()` text as field labels.
- Pages for managing users and logins.

### Phase 4: Deploy and handover

1. Connect the GitHub repo to Vercel and set the environment variables.
2. Create the Blob store and add the custom domain.
3. Write a one-page staff guide and do a test run with one staff member.

## Open questions

See "Still needed from the owner" in `docs/COMPANY-FACTS.md`.
