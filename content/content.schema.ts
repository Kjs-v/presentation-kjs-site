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

const button = z.object({
  label: z.string().describe('Button text'),
  path: sitePath.describe('Opens page'),
  style: z.enum(['primary', 'secondary']).describe('Style'),
});
const partner = z.object({ name: z.string().describe('Name'), logo: mediaPath.describe('Logo') });

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
  nav: z.array(z.object({ label: z.string(), path: sitePath })).describe('Header menu (in order)'),
  theme: z.object({
    colors: z.object({
      primary: color.describe('Header / dark panels'),
      background: color.describe('Page background'),
      surface: color.describe('Cards on dark background'),
      accent: color.describe('Highlight (buttons, active menu)'),
      accentSoft: color.describe('Soft highlight'),
      text: color.describe('Text on dark background'),
      muted: color.describe('Secondary text'),
      light: color.describe('Light section background'),
      lightText: color.describe('Text on light sections'),
      edge: color.describe('Borders'),
    }),
    fontHeading: z.string().describe('Heading font'),
    fontBody: z.string().describe('Body font'),
    googleFonts: z.array(z.string()).describe('Google Fonts to load (names), if any'),
  }),
});

/** Home page ("/"): full-screen hero with the animated company name, then "What we do". */
export const homeSchema = z.object({
  intro: z.boolean().describe('Show loading intro on first visit'),
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Big animated title'),
  summary: z.string().describe('Text under the title'),
  image: mediaPath.describe('Background photo'),
  imageCaption: z.string().describe('Photo caption'),
  buttons: z.array(button).describe('Buttons'),
  capabilitiesTitle: z.string().describe('"What we do" heading'),
  capabilities: z
    .array(titleBody.extend({ link: z.object({ label: z.string(), url }).optional() }))
    .describe('What we do'),
});

/** About page ("/about"). */
export const aboutSchema = z.object({
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Title (first line)'),
  titleEmphasis: z.string().describe('Title (highlighted second line)'),
  subtitle: z.string().describe('Subtitle'),
  image: mediaPath.describe('Photo'),
  imageCaption: z.string().describe('Photo caption'),
  buttons: z.array(button).describe('Buttons'),
  partnersTitle: z.string().describe('Partners heading'),
  partners: z.array(partner).describe('Brand partner logos'),
  storyTitle: z.string().describe('Story heading'),
});

/** Products page ("/products"): rotating best sellers on top, the full catalogue below. */
export const productsPageSchema = z.object({
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Title over the rotating products'),
  summary: z.string().describe('Text under the title'),
  rotationSeconds: z.number().min(10).max(600).describe('Seconds for one full rotation (bigger = slower)'),
  catalogTitle: z.string().describe('Heading of the full product list'),
  allLabel: z.string().describe('Filter button that shows every group'),
  viewLabel: z.string().describe('Button that opens a product'),
});

export const storySchema = z.object({
  timeline: z.array(titleBody.extend({ subtitle: z.string() })).describe('Timeline'),
  stats: z.array(stat).describe('Key numbers'),
});

/** The sections a unit page can show. Add a new id here (and a renderer in src/pages/unit.ts) for a new tab type. */
export const unitTabIds = ['products', 'clients', 'about', 'machinery'] as const;

export const unitSchema = z.object({
  id: slug.describe('ID (used in the URL, e.g. unit-1)'),
  title: z.string().describe('Title'),
  subtitle: z.string().describe('Subtitle'),
  summary: z.string().describe('Summary'),
  photo: mediaPath.describe('Big photo'),
  tabs: z
    .array(
      z.object({ id: z.enum(unitTabIds).describe('Section'), label: z.string().describe('Button text') }),
    )
    .describe('Buttons over the photo (in order). Remove one to hide that section.'),
  stats: z.array(stat).describe('Key numbers (About section)'),
  highlights: z.array(titleBody).describe('Highlights (About section)'),
});

export const productSchema = z.object({
  id: slug.describe('ID'),
  name: z.string().describe('Product name'),
  group: z.string().describe('Group, e.g. Wafers'),
  unit: slug.describe('Made in unit (unit id)'),
  description: z.string().describe('Description'),
  image: mediaPath.describe('Photo'),
  featured: z.boolean().describe('Best seller (shown in the rotating products)'),
  featuredImage: mediaPath.optional().describe('Cut-out image with a transparent background'),
  specs: z
    .array(z.object({ label: z.string().describe('Label'), value: z.string().describe('Value') }))
    .describe('Details, e.g. Item no. / Net weight / Pack'),
  order: z.number().int().describe('Display order'),
});

export const clientPackSchema = z.object({
  id: slug,
  name: z.string().describe('Pack name'),
  brand: z.string().describe('Client brand'),
  unit: slug.describe('Unit (unit id)'),
  image: mediaPath.describe('Photo'),
  order: z.number().int().describe('Display order'),
});

export const machinerySchema = z.object({
  id: slug,
  name: z.string().describe('Machine name'),
  description: z.string().describe('Description'),
  unit: slug.describe('Unit (unit id)'),
  image: mediaPath.describe('Photo'),
  order: z.number().int().describe('Display order'),
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
    about: aboutSchema,
    productsPage: productsPageSchema,
    story: storySchema,
    units: z.array(unitSchema),
    products: z.array(productSchema),
    clientPacks: z.array(clientPackSchema),
    machinery: z.array(machinerySchema),
    gallery: gallerySchema,
    slides: z.array(slideSchema),
  })
  .superRefine((c, ctx) => {
    const unitIds = new Set(c.units.map((u) => u.id));
    const productIds = new Set(c.products.map((p) => p.id));
    const checkUnit = (list: { unit: string }[], key: string) =>
      list.forEach((item, i) => {
        if (!unitIds.has(item.unit))
          ctx.addIssue({ code: 'custom', path: [key, i, 'unit'], message: `Unknown unit "${item.unit}"` });
      });
    checkUnit(c.products, 'products');
    checkUnit(c.clientPacks, 'clientPacks');
    checkUnit(c.machinery, 'machinery');
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
export type UnitTabId = (typeof unitTabIds)[number];
export type Slide = Content['slides'][number];
