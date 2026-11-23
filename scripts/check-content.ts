/**
 * Validates content/content.json against content/content.schema.ts,
 * and checks that every /media/... path points at a real file in public/.
 * Runs with `npm run check:content` and before every build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentSchema } from '../content/content.schema';

const root = path.resolve(import.meta.dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'content/content.json'), 'utf8'));

const result = contentSchema.safeParse(raw);
const problems: string[] = [];

if (!result.success) {
  for (const issue of result.error.issues) problems.push(`${issue.path.join('.')}: ${issue.message}`);
}

// Every media path must exist on disk.
const walk = (value: unknown, at: string): void => {
  if (typeof value === 'string' && value.startsWith('/media/')) {
    if (!fs.existsSync(path.join(root, 'public', value))) problems.push(`${at}: file not found ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${at}.${i}`));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k);
};
walk(raw, '');

if (problems.length) {
  console.error(`content.json has ${problems.length} problem(s):\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log('content.json OK');
