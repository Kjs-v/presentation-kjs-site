/**
 * THE single source of truth for what content the site has.
 *
 * - The frontend reads content that matches this schema (src/lib/content.ts).
 * - `npm run check:content` validates content/content.json against it (also runs on every build).
 * - Later, the backend will validate saves with it, and the admin page will generate its forms from it.
 *
 * To add or change a field:
 *   1. Change it here.
 *   2. Update content/content.json to match.
 *   3. Use it in the UI.
 * Use `.describe('...')` for a plain-English label. The admin page will show it to non-technical staff.
 */
import { z } from 'zod';

/** A file under public/, written as a site path, e.g. "/media/products/maria-biscuits.jpg". */
const mediaPath = z
  .string()
  .regex(/^\/media\/.+\.(jpe?g|png|webp|svg|gif|mp4|webm|pdf)$/i, 'Must be a /media/... file');
const sitePath = z.string().regex(/^\//, 'Must start with /');
const url = z.string().url();
const slug = z.string().regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex colour, e.g. #112d27');

const titleBody = z.object({
  title: z.string().min(1).describe('Title'),
  body: z.string().describe('Text'),
});

const stat = z.object({
  value: z.union([z.number(), z.string()]).describe('Value'),
  prefix: z.string().optional().describe('Before the value, e.g. ₹'),
  suffix: z.string().optional().describe('After the value, e.g. + or acres'),
  label: z.string().describe('Label'),
});

export const siteSchema = z.object({
  name: z.string().describe('Company name'),
  tagline: z.string().describe('Tagline'),
  logo: mediaPath.describe('Logo'),
  contact: z.object({
    phone: z.string().describe('Phone'),
    email: z.string().email().describe('Email'),
    address: z.string().describe('Address'),
    mapUrl: url.describe('Map link'),
  }),
  links: z.array(z.object({ label: z.string(), url })).describe('Footer links'),
  nav: z.array(z.object({ label: z.string(), path: sitePath })).describe('Menu'),
  theme: z.object({
    colors: z.object({
      primary: color,
      accent: color,
      background: color,
      text: color,
      muted: color,
    }),
    fontHeading: z.string().describe('Heading font (Google Fonts name)'),
    fontBody: z.string().describe('Body font (Google Fonts name)'),
  }),
});

export const homeSchema = z.object({
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Main title'),
  subtitle: z.string().describe('Subtitle'),
  image: mediaPath.describe('Hero image'),
  buttons: z
    .array(z.object({ label: z.string(), path: sitePath, style: z.enum(['primary', 'secondary']) }))
    .describe('Buttons'),
  partnersTitle: z.string().describe('Partners heading'),
  partners: z.array(z.object({ name: z.string(), logo: mediaPath })).describe('Brand partner logos'),
  capabilitiesTitle: z.string().describe('Capabilities heading'),
  capabilities: z.array(titleBody).describe('Capabilities'),
});

export const storySchema = z.object({
  timeline: z.array(titleBody.extend({ subtitle: z.string() })).describe('Timeline'),
  stats: z.array(stat).describe('Key numbers'),
});

export const unitSchema = z.object({
  id: slug.describe('ID (used in the URL, e.g. unit-1)'),
  title: z.string(),
  subtitle: z.string(),
  summary: z.string(),
  photo: mediaPath,
  stats: z.array(stat),
  highlights: z.array(titleBody),
});

export const productSchema = z.object({
  id: slug.describe('ID'),
  name: z.string().describe('Product name'),
  group: z.string().describe('Group, e.g. Wafers'),
  unit: slug.describe('Made in unit (unit id)'),
  description: z.string().describe('Description'),
  image: mediaPath.describe('Photo'),
  featured: z.boolean().describe('Best seller'),
  featuredImage: mediaPath.optional().describe('Best-seller cut-out image'),
  order: z.number().int().describe('Display order'),
});

export const clientPackSchema = z.object({
  id: slug,
  name: z.string().describe('Pack name'),
  brand: z.string().describe('Client brand'),
  image: mediaPath.describe('Photo'),
  order: z.number().int(),
});

export const gallerySchema = z.object({
  video: z.object({ src: mediaPath, poster: mediaPath, caption: z.string() }),
  photos: z.array(z.object({ src: mediaPath, caption: z.string() })),
});

/** Slides are a "discriminated union": each `kind` has its own fields. Add a new kind here to add a new slide layout. */
const slideBase = { id: slug, title: z.string(), summary: z.string().optional() };
export const slideSchema = z.discriminatedUnion('kind', [
  z.object({ ...slideBase, kind: z.literal('cover'), image: mediaPath }),
  z.object({ ...slideBase, kind: z.literal('facts'), items: z.array(titleBody) }),
  z.object({ ...slideBase, kind: z.literal('logos') }),
  z.object({ ...slideBase, kind: z.literal('products'), productIds: z.array(slug) }),
]);

export const contentSchema = z
  .object({
    site: siteSchema,
    home: homeSchema,
    story: storySchema,
    units: z.array(unitSchema),
    products: z.array(productSchema),
    clientPacks: z.array(clientPackSchema),
    gallery: gallerySchema,
    slides: z.array(slideSchema),
  })
  .superRefine((c, ctx) => {
    const unitIds = new Set(c.units.map((u) => u.id));
    const productIds = new Set(c.products.map((p) => p.id));
    c.products.forEach((p, i) => {
      if (!unitIds.has(p.unit))
        ctx.addIssue({ code: 'custom', path: ['products', i, 'unit'], message: `Unknown unit "${p.unit}"` });
    });
    c.slides.forEach((s, i) => {
      if (s.kind === 'products')
        s.productIds.forEach((id, j) => {
          if (!productIds.has(id))
            ctx.addIssue({
              code: 'custom',
              path: ['slides', i, 'productIds', j],
              message: `Unknown product "${id}"`,
            });
        });
    });
  });

export type Content = z.infer<typeof contentSchema>;
export type Site = Content['site'];
export type Product = Content['products'][number];
export type Unit = Content['units'][number];
export type Slide = Content['slides'][number];
