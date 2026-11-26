/**
 * Brings the database up to date after the site changes in code (see server/upgrade.ts for the rules).
 * Safe to run more than once, and never overwrites anything a person changed in the admin page.
 *
 *   npm run db:upgrade               # dev database (DATABASE_URL)
 *   npm run db:upgrade -- --dry-run  # only show what would change
 *
 * See docs/BACKEND-PLAN.md before running it on production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { upgradeDatabase } from '../server/upgrade';

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(import.meta.dirname, '..');
const WHY = {
  added: 'added from content.json',
  replaced: 'replaced with content.json (not edited in admin)',
  filled: 'kept admin edits, filled in new fields',
};

async function main() {
  const content = JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8'));
  const report = await upgradeDatabase(content, { dryRun });
  for (const k of report.removed) console.log(`${k}: no longer part of the site, removed.`);
  for (const c of report.changes) console.log(`${c.key}: ${WHY[c.why]}.`);
  if (!report.changes.length && !report.removed.length) return console.log('Database already up to date.');
  if (dryRun) return console.log('Dry run: nothing was changed.');
  if (report.skipped.length)
    console.log(
      `Someone saved ${report.skipped.join(', ')} while this ran, so those were left alone. Run it again.`,
    );
  console.log('Done. Live content passes all checks.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
