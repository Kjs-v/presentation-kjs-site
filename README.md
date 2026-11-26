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

| Command                 | What it does                                                           |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run dev`           | Start the local dev server                                             |
| `npm run build`         | Check everything, then build to `dist/`                                |
| `npm run check`         | Type check + content check                                             |
| `npm run check:content` | Validate `content/content.json` and check that every media file exists |
| `npm run format`        | Format all files with Prettier                                         |

## Folder structure

```
├── index.html              Empty shell. All content is rendered from content.json
├── content/
│   ├── content.json        ALL site content (the future database seed)
│   └── content.schema.ts   The shape of that content (Zod). The contract between UI, API and admin page
├── src/
│   ├── main.ts             Entry: loads content, applies theme, registers routes
│   ├── layout.ts           Header and footer
│   ├── components.ts       Shared pieces: stats, cards, photo tiles
│   ├── widgets/            notes.ts, orbit.ts (rotating products), product-dialog.ts, colour-menu.ts, download.ts (Download PDF)
│   ├── pages/              One file per page (home, about, unit, gallery, products, show, promoters, supply-chain, marico + marico-film)
│   ├── lib/
│   │   ├── content.ts      loadContent(): the ONLY way pages get content
│   │   ├── router.ts       Small client-side router
│   │   ├── theme.ts        Turns site.theme.palettes into --c-* CSS variables; theme switching
│   │   ├── icons.ts        Inline SVG icons
│   │   ├── effects.ts      Sparkles, hide-on-scroll header, intro loader
│   │   └── dom.ts          h() helper for building elements
│   └── styles/theme.css    Site styles (ported from the design reference). Colours come from the theme palettes as --c-* variables; never hardcode one
├── public/favicon.*        Favicon (from the KJS_v1 project)
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

**Header:** the company name (links home), the page links from `site.nav`, and three buttons:

- **Notes:** opens the meeting-notes panel in the bottom-right corner, which can go full screen. Notes are saved per browser.
- **Colours:** the round dot opens a small menu: **White**, or **Multi colour** (the swatches in `site.menu.colour`, plus "any colour"). After picking, it asks **This page only** or **All pages**. Choices are remembered per browser; the closest palette in `site.theme.palettes` supplies readable text colours. `?theme=royal` or `?theme=white` in a link forces a palette.
- **Full screen:** the button, or press **F** on any page (Esc leaves full screen).

On narrow screens the links fold into a Menu button.

| Path                                                   | Page                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                    | Home: "Trusted by global leaders" with client logos (`home.clients`), a turning circle of packs (`home.packs`), key figures (`home.stats`) and "What we do". Add `?nointro` to skip the loading intro.                                                                                                                                               |
| `/unit-1`, `/unit-2`                                   | Unit page: a big photo with buttons over it (`unit.tabs` in content.json)                                                                                                                                                                                                                                                                            |
| `/unit-1/products`, `/clients`, `/about`, `/machinery` | The section each button opens below the photo. Unit 2 has no Clients button yet.                                                                                                                                                                                                                                                                     |
| `/gallery`, `/gallery/machinery`, `/gallery/products`  | Gallery: videos and photos, with section buttons next to the title (`gallery.tabs`). Machinery shows every unit's machines; Products holds the old Products page (orbiting best sellers, then the full catalogue; text in `productsPage`). `/products` redirects here, `/about` redirects home.                                                      |
| `/supply-chain`                                        | Supply Chain: a 3D scene (Three.js, loaded only on this page) of the Unit 1 dock, then trucks to every city on an India map, in chapters (← → or clicker, P = pause). Everything is in `supplyChain` in content.json; the outline is `/media/maps/india-outline.svg` (Natural Earth 1:50m admin boundaries, including Jammu and Kashmir and Ladakh). |
| `/show`                                                | Slide deck (← → or clicker)                                                                                                                                                                                                                                                                                                                          |

**Unit buttons:** to add, remove or reorder them, edit that unit's `tabs` in content.json.
For a new kind of section, add its id to `unitTabIds` in the schema and a renderer in `src/pages/unit.ts`.
