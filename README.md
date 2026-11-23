# KJS India presentation site

A presentation website for KJS India. All content (text, products, slides, images, colours) lives in data files.
Later it will move to a database edited through an admin page, so non-technical staff can change the site without touching code.

**Read first:** [`docs/PLAN.md`](docs/PLAN.md) (plan, stack and phases), then [`docs/notes/README.md`](docs/notes/README.md) (how we keep notes).

## Getting started

Needs **Node 20+**.

```bash
npm install
cp .env.example .env    # ask the project owner for the values (not needed for phase 1)
npm run dev             # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Check everything, then build to `dist/` |
| `npm run check` | Type check + content check |
| `npm run check:content` | Validate `content/content.json` and check that every media file exists |
| `npm run format` | Format all files with Prettier |

## Folder structure

```
├── index.html              Empty shell. All content is rendered from content.json
├── content/
│   ├── content.json        ALL site content (the future database seed)
│   └── content.schema.ts   The shape of that content (Zod). The contract between UI, API and admin page
├── src/
│   ├── main.ts             Entry: loads content, applies theme, registers routes
│   ├── layout.ts           Header and footer
│   ├── pages/              One file per page (home, products, show, unit, gallery)
│   ├── lib/
│   │   ├── content.ts      loadContent(): the ONLY way pages get content
│   │   ├── router.ts       Small client-side router
│   │   ├── theme.ts        Turns site.theme into CSS variables
│   │   └── dom.ts          h() helper for building elements
│   └── styles/base.css     Temporary styles. Use the CSS variables, not fixed colours
├── public/media/           Our images and videos, served at /media/...
│   ├── products/           Product photos (72)
│   ├── featured/           Best-seller cut-outs (transparent .webp)
│   ├── unit-1-packs/       Client brand pack photos (30)
│   ├── logos/              KJS + partner logos
│   ├── units/              Unit photos
│   ├── machinery/          Machine photos
│   └── video/              Videos + poster images
├── scripts/                Dev scripts (content check)
├── docs/
│   ├── PLAN.md             Plan, stack, phases
│   ├── COMPANY-FACTS.md    Company facts to write content from
│   └── notes/              One notes file per person (see the rules there)
├── api/                    (phase 2) Vercel Functions
└── vercel.json             Vercel build + page routing
```

## Team rules

1. **No hardcoded content.**
   - Text, image paths, links and colours go in `content/content.json`.
   - Pages get them from `loadContent()`.
2. **Schema first.** Need a new field or slide type?
   - Add it to `content/content.schema.ts`, with a `.describe('Plain label')`.
   - Then add it to `content.json`, then use it in the UI.
3. **Images** go in the right `public/media/` folder.
   - Use lowercase-dash names, e.g. `gofrey-cocoa.jpg`.
   - Reference them as `/media/...`.
4. **`npm run build` must pass** before you push.
5. **Branches:**
   - Work on `feature/<short-name>` and open a pull request into `main`.
   - Don't push to `main` directly.
6. **Never commit `.env`** or any password or key.
7. **Notes:** follow [`docs/notes/README.md`](docs/notes/README.md).
   - Say who you are, and create `docs/notes/<your-name>.md` if it's your first time.
   - Only edit your own file.

## Routes

| Path | Page |
|---|---|
| `/` | Home / About |
| `/products` | Best sellers + all products by group |
| `/show` | Slide deck (← → or clicker, F = full screen) |
| `/unit-1`, `/unit-2` | Unit pages (any id in `content.units`) |
| `/gallery` | Video + machinery photos |
