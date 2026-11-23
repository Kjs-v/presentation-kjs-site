/**
 * Writes the published content from the database back into content/content.json.
 * Run before each deploy so the site's built-in fallback copy matches what is live.
 *
 *   npm run db:export
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentSchema, sectionKeys } from '../content/content.schema';
import { db, schema } from '../server/db/client';

const root = path.resolve(import.meta.dirname, '..');

async function main() {
  const rows = await db()
    .select({ key: schema.sections.key, published: schema.sections.published })
    .from(schema.sections);
  const byKey = new Map(rows.map((r) => [r.key, r.published]));
  const missing = sectionKeys.filter((k) => !byKey.has(k));
  if (missing.length)
    throw new Error(`Missing sections in the database: ${missing.join(', ')}. Run npm run db:seed first.`);

  const content = Object.fromEntries(sectionKeys.map((k) => [k, byKey.get(k)]));
  // Parsing refuses broken content and writes fields in the schema's order (Postgres reorders JSON keys),
  // so repeated exports produce the same file.
  const ordered = contentSchema.parse(content);
  fs.writeFileSync(path.join(root, 'content/content.json'), JSON.stringify(ordered, null, 2) + '\n');
  console.log(`content.json updated from the database (${sectionKeys.length} sections).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
