# Notes: vineet

- **Role:** Project owner
- **Started:** 2026-11-23

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
