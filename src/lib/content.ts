/**
 * The ONLY place the UI gets content from.
 *
 * Today it reads content/content.json, bundled at build time.
 * In phase 2 this becomes `fetch('/api/content')` — pages won't need to change.
 * Never import content.json directly from a page; always go through loadContent().
 */
import raw from '../../content/content.json';
import { contentSchema, type Content } from '../../content/content.schema';

let cache: Content | undefined;

export async function loadContent(): Promise<Content> {
  cache ??= contentSchema.parse(raw);
  return cache;
}
