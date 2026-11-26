/**
 * Adds fields that are missing from `value`, taking them from `defaults`.
 * Nothing that already exists is changed: lists and plain values are kept as they are,
 * and only objects are walked into. Used when the site structure gains new fields or sections,
 * so older saved content (database rows, history copies) can be brought up to date.
 */
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function fillMissing(value: unknown, defaults: unknown): unknown {
  if (value === undefined) return defaults;
  if (!isObject(value) || !isObject(defaults)) return value;
  const out: Record<string, unknown> = { ...value };
  for (const [key, def] of Object.entries(defaults)) out[key] = fillMissing(value[key], def);
  return out;
}
