# Notes: vineet

- **Role:** Project owner
- **Started:** 2026-11-23

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
