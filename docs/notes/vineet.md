# Notes: vineet

- **Role:** Project owner
- **Started:** 2026-11-23

## 2026-11-23 (Backend phase 1: database)

- **Did:** backend phase 1, following `docs/BACKEND-PLAN.md`.
  - Created a separate Neon database `kjs_dev` for development and tests. The production database `db-02` is still empty and untouched.
  - Defined 7 tables in `server/db/schema.ts` (users, sections, versions, media, pitches, login_attempts, notes) and applied the first migration (`server/db/migrations/`).
  - `npm run db:seed` loads content.json and is safe to run twice. `npm run db:export` writes the database back to content.json, in a stable order.
  - Images can now also be Vercel Blob links; look-alike domains are rejected.
  - First tests: `npm test` (9 passing).
- **Next:** phase 2, the API (login, save with version check, publish, history, media tokens, users).
- **Waiting on:** the first admin email (`ADMIN_EMAIL` in .env) and the Vercel Blob store.

## 2026-11-23 (Mayora pitch on the site)

- **Did:** rebuilt the Mayora India pitch as a page of the site: `public/pitches/mayora/index.html`, served at `/pitches/mayora/`.
  - Clicking the **Mayora logo** (About page, Unit 1 Clients, slides) opens it. This is set by `link` on the partner in content.json.
  - Red and white (Mayora colours), with a white or red background. T or the Colours button switches.
  - Bigger KJS logo in the header band.
  - 8 slides:
    1. Cover: "Trusted Co-manufacturer for Choki Choki"
    2. Where we began
    3. Growth: bars drawn as Choki sticks, 2023 as a cut piece, bigger numbers
    4. Scalability: 1 → 4 sticks plus pack photos
    5. Unit 2 with KJS products
    6. For discussion, with Unit 2 images
    7. Commitment plus a mini gallery (company film, Unit 2 inauguration, Choki team training, groundbreaking, foundation stone)
    8. Thank you, with a photo from the groundbreaking
  - Removed the old "numbers" and "how Unit 1 delivers" slides. The date is December 2026.
- **D: drive:** found no ribbon-cutting photo (the 15 May 2026 event was a groundbreaking with lamp lighting and a plaque).
  - Slide 8 uses the photo provided (ROH02464). An alternative is ROH02866, a podium speech in front of the plaque.
  - The plaque gives the Unit 2 address: Thogarpally, Aliyabad (V), Kondapur Mandal, Sangareddy.
- **Note:** the pitch text is written in the page's HTML, not in content.json yet. It moves to content.json with the admin work.

## 2026-11-23 (Simple header + material from the D: drive)

- **Did:** dropped the corner navigator.
  - The header now has the page links, plus Notes, the white / royal blue switch, and Full screen.
- **New material from D:\KJS INDIA PVT LTD:**
  - Videos, compressed to 720p in `public/media/video/`: the company film (43 MB, from 2 GB) and the Unit 2 inauguration (23 MB).
  - Photos from "unit 1 and 2.pdf":
    - the Unit 1 front (now the Unit 1 photo)
    - the Unit 2 architect's render (replaces the AI-looking Unit 2 image, which is deleted)
    - the Unit 2 MoU signing
    - two RVL machine photos
  - Google Maps links for Unit 1 and Unit 2 (from "kjs india links.txt"), shown on each unit's About tab.
  - Unit 2 site plan (draft, 3 Dec 2025): factory shed about 39,068 m², total built area about 64,693 m². Shown as "planned".
- **Content changes:**
  - Unit 1 stats: 22 packing machines, 6 ball mills, 5 flow-wrap machines.
  - Unit 1 highlights: Project Choki and RVL machines.
  - Ball mills moved to Unit 1, and the empty Machinery tab removed from Unit 2.
  - Gallery now holds a list of videos.
  - Timeline: 2025 MoU added.
- **Open:**
  - The Unit 2 location in the site plan says "KJS-Peddapur", but the public announcement says Thogarpally. Confirm.
  - Products tagged Unit 2: where are they made today?
  - The big shoot folders on D: (`2026_05_15 KJS Rach`, 401 GB; `May KJS Shoot`) are not used yet.

## 2026-11-23 (Navigator + white / royal blue themes)

- **Did:** removed the page links from the header. Navigation is now the gold KJS coin in the bottom-right corner.
  - The menu is closed by default. It opens on click, and choosing an item closes it.
  - Outer arc: Home, About, Products, Gallery. Inner arc: Unit 1, Notes, Unit 2.
  - Notes open as a corner panel with its own full-screen button, saved in the browser.
  - A two-tone colour switch inside the navigator toggles white / royal blue, remembered per browser. `?theme=royal` forces one.
- **Themes:** removed all green.
  - The two palettes live in `site.theme.palettes` in content.json, and every colour in theme.css is a --c-* variable.
  - Default is white (`site.theme.default`).
- **Next:** decide which theme is the default for client meetings.

## 2026-11-23 (Footer + corner menu previews)

- **Did:** updated the footer.
  - Order is now phone, email, then **Find us** (map pin, opens Google Maps), the **KJS INDIA** logo (links to the company website), **LinkedIn** (with icon), and Back to top.
  - Content: `site.contact.mapLabel`, plus `icon` on each `site.links` entry (`logo` / `linkedin` / `link`). Icons are in `src/lib/icons.ts`.
- **Previews (not in the code yet):** a corner menu in three colours (green, white, royal blue).
  - One button in the bottom-right corner fans out the pages and Notes.
  - Notes open as a small corner panel that can go full screen.
- **Next:** pick a colour for the corner menu, then build it into the site in place of the header links.

## 2026-11-23 (Products page)

- **Did:** added Products to the header (About, Products, Unit 1, Unit 2, Gallery).
  - `/products` hero (~75% of the screen): the 9 best sellers slowly orbit. Hover pauses, and clicking opens a product pop-up.
  - Below the hero, the catalogue as in the design reference: group filters, a large selected-product panel with details, then every product card with "View product".
  - Product cards on the Unit pages and slides now open the same pop-up.
  - Content: new `productsPage` section (texts + rotation speed), and `specs` on each product.
    - Specs are filled for the 9 best sellers from the catalogue: item no., net weight, pack.
- **Next:** product descriptions are empty, so add them in content.json.

## 2026-11-23 (UI template)

- **Did:** set up the UI template.
  - Header menu is now About, Unit 1, Unit 2, Gallery. The home page `/` opens first.
  - Home page ported from the design reference: full-screen photo, animated company name, loading intro, sparkles, "What we do".
  - New `/about` page.
  - Unit pages: a big photo with pop-up buttons (Products, Clients, About, Machinery) that open each section below.
    - Unit 2 has no Clients button for now.
  - New content: `about`, `machinery` (each machine is assigned to a unit), `unit.tabs`, and `unit` on client packs.
  - Favicon copied from KJS_v1.
  - Moved Peti Latte to Biscuits and Keky Latte to Confectionery (both Unit 2).
- **Next:** check the product names and groups, and the machine-to-unit mapping (packing conveyor assumed to be Unit 1).

## 2026-11-23

- **Did:** set up the repo template.
  - Folder structure, with all media in `public/media/`.
  - Vite + TypeScript skeleton with routing (`/`, `/products`, `/show`, `/unit-1`, `/unit-2`, `/gallery`).
  - Content schema (`content/content.schema.ts`) and starter `content/content.json`, generated from the image file names.
  - Content check script, docs, `.env.example` and the Vercel config.
- **Next:** the team builds the temporary UI (phase 1), following the design reference in `docs/PLAN.md`.
- **Blocked / questions:**
  - The product names and groups were guessed from file names and need checking.
  - The assumptions listed in `docs/COMPANY-FACTS.md` need confirming.
