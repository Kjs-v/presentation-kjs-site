import { describe, expect, it } from 'vitest';
import content from '../content/content.json';
import { contentSchema, contentSections, sectionKeys } from '../content/content.schema';

const logo = contentSections.shape.site.shape.logo;

describe('content schema', () => {
  it('accepts the current content.json', () => {
    expect(contentSchema.safeParse(content).success).toBe(true);
  });

  it('lists every section once', () => {
    expect(sectionKeys).toEqual(Object.keys(content));
  });

  it.each([
    '/media/logos/kjs-india.png',
    'https://abc123xyz.public.blob.vercel-storage.com/products/gofrey-AbC12.webp',
  ])('accepts media path %s', (value) => {
    expect(logo.safeParse(value).success).toBe(true);
  });

  it.each([
    'https://evil.example.com/x.png', // other websites
    'media/x.png', // not a site path
    '/media/x.exe', // not a picture, video or PDF
    'https://abc.public.blob.vercel-storage.com.evil.com/x.png', // look-alike domain
  ])('rejects media path %s', (value) => {
    expect(logo.safeParse(value).success).toBe(false);
  });

  it('rejects a product pointing at a unit that does not exist', () => {
    const broken = structuredClone(content);
    broken.products[0].unit = 'unit-99';
    expect(contentSchema.safeParse(broken).success).toBe(false);
  });
});
