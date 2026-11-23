# Instructions for AI coding assistants

These rules apply to any AI assistant working in this repo (Claude Code, Cursor, Copilot, Codex, and others).

1. Read `README.md` and `docs/PLAN.md` before making changes.
2. **Notes:** before writing to `docs/notes/`:
   - Ask the person you are working for who they are, unless they have already told you in this session.
   - Write only to `docs/notes/<their-name>.md`. If it doesn't exist, create it from `docs/notes/_TEMPLATE.md` and add them to the table in `docs/notes/README.md`.
   - Never edit another person's notes file.
3. **No hardcoded content.**
   - Content comes from `content/content.json`, read only through `loadContent()` in `src/lib/content.ts`.
   - New fields go into `content/content.schema.ts` first, with `.describe()` labels.
4. Use only media from `public/media/`. Never download images from the design-reference site.
5. Run `npm run build` (types + content check + build) before saying the work is done.
6. Never read out, print or commit the values in `.env`.
