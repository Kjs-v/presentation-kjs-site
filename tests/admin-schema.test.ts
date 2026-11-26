/**
 * The admin page builds its forms from the content schema (src/admin/form.ts). This test fails when the
 * schema gains a kind of field those forms can't edit, so the form code gets updated with the schema.
 */
import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { contentSections } from '../content/content.schema';

type Node = {
  type?: string | string[];
  properties?: Record<string, Node>;
  items?: Node | Node[];
  anyOf?: Node[];
  additionalProperties?: Node | boolean;
  const?: unknown;
  allOf?: unknown;
  oneOf?: unknown;
  $ref?: string;
};

function unsupported(node: Node, path: string, out: string[] = []): string[] {
  if (node.allOf || node.oneOf || node.$ref) out.push(`${path}: allOf/oneOf/$ref`);
  if (node.anyOf) {
    const kinds = node.anyOf.map((v) => v.properties?.kind?.const);
    const allStrings = node.anyOf.every((v) => v.type === 'string');
    if (!allStrings && kinds.some((k) => k === undefined)) out.push(`${path}: mixed choice without "kind"`);
    node.anyOf.forEach((v, i) => unsupported(v, `${path}<${String(kinds[i])}>`, out));
    return out;
  }
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (!types[0] && node.const === undefined) out.push(`${path}: no type`);
  if (types.includes('object') && !node.properties) {
    const values = node.additionalProperties;
    if (typeof values !== 'object' || values.type !== 'string')
      out.push(`${path}: free-key object of non-text`);
  }
  if (Array.isArray(node.items)) {
    node.items.forEach((part, i) => {
      if (part.type !== 'number' && part.type !== 'string')
        out.push(`${path}.${i}: pair of non-plain values`);
    });
  } else if (node.items) unsupported(node.items, `${path}[]`, out);
  for (const [key, sub] of Object.entries(node.properties ?? {})) unsupported(sub, `${path}.${key}`, out);
  return out;
}

describe('admin forms', () => {
  it('can edit every field in the content schema', () => {
    const json = zodToJsonSchema(contentSections, { $refStrategy: 'none', target: 'jsonSchema7' }) as Node;
    expect(unsupported(json, 'content')).toEqual([]);
  });
});
