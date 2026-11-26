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

/**
 * A picture, video or PDF: either a file in the site (/media/...) or a file uploaded through the admin page
 * (stored on Vercel Blob, https://<store>.public.blob.vercel-storage.com/...).
 */
const mediaPath = z
  .string()
  .regex(
    /^(\/media\/|https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/).+\.(jpe?g|png|webp|svg|gif|mp4|webm|pdf)$/i,
    'Must be a /media/... file or an uploaded file',
  );
const sitePath = z.string().regex(/^\//, 'Must start with /');
const url = z.string().url();
const slug = z.string().regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only');

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
  path: z.union([sitePath, url]).describe('Opens page (/gallery) or website (https://...)'),
  style: z.enum(['primary', 'secondary']).describe('Style'),
  newTab: z.boolean().optional().describe('Open in a new tab'),
});
/** One colour theme. Values are CSS colours (hex), or a CSS gradient where the name says so. */
const palette = z.object({
  bg: z.string().describe('Page background'),
  surface: z.string().describe('Cards and panels'),
  surfaceStrong: z.string().describe('Raised panels'),
  text: z.string().describe('Text'),
  muted: z.string().describe('Secondary text'),
  edge: z.string().describe('Borders'),
  accent: z.string().describe('Highlight (saffron buttons, current page)'),
  onAccent: z.string().describe('Text on the highlight colour'),
  heading: z.string().describe('Section headings'),
  eyebrow: z.string().describe('Small text above titles'),
  link: z.string().describe('Links'),
  headerBg: z.string().describe('Header background'),
  footerBg: z.string().describe('Footer background'),
  photoBg: z.string().describe('Background behind product photos'),
  scrim: z.string().describe('See-through background for labels over photos'),
  heroOverlay: z.string().describe('Gradient over big photos, so text stays readable'),
  heroText: z.string().describe('Text over big photos'),
  heroMuted: z.string().describe('Secondary text over big photos'),
  heroShadow: z.string().describe('Shadow under big titles (CSS text-shadow, or none)'),
  menuRing: z.string().describe('Faint dots and rings'),
  menuGlow: z.string().describe('Soft glow behind highlights'),
  shadow: z.string().describe('Shadows'),
});

const partner = z.object({
  name: z.string().describe('Name'),
  logo: mediaPath.describe('Logo'),
  link: sitePath
    .optional()
    .describe('Page opened by clicking the logo, e.g. a partner pitch (/pitches/mayora/)'),
});

export const siteSchema = z.object({
  name: z.string().describe('Company name'),
  tagline: z.string().describe('Tagline'),
  logo: mediaPath.describe('Logo (white lettering, for dark backgrounds)'),
  logoOnLight: mediaPath.describe('Logo with dark lettering, for white backgrounds (footer)'),
  icon: mediaPath.describe('Round logo mark shown alone in the header'),
  contact: z.object({
    phone: z.string().describe('Phone'),
    email: z.string().email().describe('Email'),
    address: z.string().describe('Address shown in the footer (each new line shows on its own line)'),
    mapLabel: z.string().describe('Map button text, e.g. Find us'),
    locations: z
      .array(
        z.object({
          label: z.string().describe('Name, e.g. Unit 1'),
          address: z.string().describe('Full address'),
          mapUrl: url.describe('Google Maps link'),
        }),
      )
      .min(1)
      .describe('Places offered by the Find us button (each opens its map)'),
  }),
  links: z
    .array(
      z.object({
        label: z.string().describe('Text (also read out by screen readers)'),
        url,
        icon: z
          .enum(['logo', 'linkedin', 'link'])
          .describe('logo = show the KJS logo instead of text; linkedin = LinkedIn icon; link = plain link'),
      }),
    )
    .describe('Footer links, after phone, email and map'),
  nav: z
    .array(z.object({ label: z.string().describe('Text'), path: sitePath.describe('Opens page') }))
    .describe('Header links, in order (the logo always links to the home page)'),
  partners: z.array(partner).describe('Client logos (slides and Customers sections)'),
  menu: z.object({
    notesLabel: z.string().describe('Notes button text'),
    themeToggleLabel: z.string().describe('Colour switch label (read out by screen readers)'),
    colour: z
      .object({
        whiteLabel: z.string().describe('Option that puts the site back to white'),
        multiLabel: z.string().describe('Option that opens the colour palette'),
        swatches: z
          .array(
            z.object({
              label: z.string().describe('Colour name'),
              color: z
                .string()
                .regex(/^#[0-9a-fA-F]{6}$/, 'A hex colour like #1c3a9e')
                .describe('Background colour (hex)'),
            }),
          )
          .min(1)
          .describe('Background colours offered in the palette'),
        customLabel: z.string().describe('Label of the "pick any colour" control'),
        scopeQuestion: z.string().describe('Question asked after picking a colour'),
        thisPage: z.string().describe('Answer: only this page'),
        allPages: z.string().describe('Answer: every page'),
        cancel: z.string().describe('Cancel button'),
      })
      .describe('Colour menu in the header'),
    download: z
      .object({
        label: z.string().describe('Download button text'),
        thisPage: z.string().describe('Option: save the page on screen as PDF'),
        fullProfile: z.string().describe('Option: save the whole company profile as one PDF'),
        preparing: z.string().describe('Shown while the full profile is being prepared'),
      })
      .describe('Download as PDF menu in the header'),
    pager: z
      .object({
        previous: z.string().describe('Read out for the left arrow, e.g. Previous page'),
        next: z.string().describe('Read out for the right arrow, e.g. Next page'),
      })
      .describe('Faint arrows at the left and right screen edges that go through the header pages in order'),
  }),
  theme: z.object({
    default: z.string().describe('Theme shown first (id of one of the palettes)'),
    fontHeading: z.string().describe('Heading font'),
    fontBody: z.string().describe('Body font'),
    googleFonts: z.array(z.string()).describe('Google Fonts to load (names), if any'),
    palettes: z
      .array(z.object({ id: slug.describe('ID'), label: z.string().describe('Name'), colors: palette }))
      .min(1)
      .describe('Colour themes. The corner menu switch cycles through them.'),
  }),
});

/** Home page ("/"): client logos and rotating packs, then key figures. */
export const homeSchema = z.object({
  intro: z.boolean().describe('Show loading intro on first visit'),
  title: z.string().describe('Big title, e.g. Trusted by global leaders'),
  clients: z
    .array(z.object({ name: z.string().describe('Client name'), logo: mediaPath.describe('Logo') }))
    .describe('Client logos under the title, in order'),
  summary: z.string().describe('Text under the logos'),
  buttons: z.array(button).describe('Buttons'),
  packs: z
    .array(
      z.object({
        name: z.string().describe('Product name'),
        brand: z.string().describe('Client'),
        image: mediaPath.describe('Pack photo with a see-through background'),
      }),
    )
    .min(3)
    .describe('Packs that turn in a circle next to the title'),
  stats: z.array(stat).describe('Key figures under the top section'),
});

/** Products, shown in the Gallery's Products tab ("/gallery/products"): rotating best sellers on top, the full catalogue below. */
export const productsPageSchema = z.object({
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Title over the rotating products'),
  summary: z.string().describe('Text under the title'),
  rotationSeconds: z.number().min(10).max(600).describe('Seconds for one full rotation (bigger = slower)'),
  catalogTitle: z.string().describe('Heading of the full product list'),
  allLabel: z.string().describe('Filter button that shows every group'),
  viewLabel: z.string().describe('Button that opens a product'),
});

/** The sections a unit page can show. Add a new id here (and a renderer in src/pages/unit.ts) for a new tab type. */
export const unitTabIds = [
  'products',
  'customers',
  'about',
  'machinery',
  'supply-chain',
  'certifications',
] as const;

export const unitSchema = z.object({
  id: slug.describe('ID (used in the URL, e.g. unit-1)'),
  title: z.string().describe('Title'),
  subtitle: z.string().describe('Subtitle'),
  summary: z.string().describe('Summary'),
  photo: mediaPath.describe('Big photo'),
  photoCaption: z.string().optional().describe("Label on the photo, e.g. Architect's render"),
  mapUrl: url.optional().describe('Google Maps link to this unit'),
  tabs: z
    .array(
      z.object({
        id: z.enum(unitTabIds).describe('Section'),
        label: z.string().describe('Button text'),
        url: url
          .optional()
          .describe('Optional: open this web address in a new tab instead of showing the section'),
      }),
    )
    .describe('Buttons over the photo (in order). Remove one to hide that section.'),
  productPacks: z
    .object({
      title: z.string().describe('Heading, e.g. Unit-1 products'),
      packs: z.array(slug).min(1).describe('Client packs shown, in order (clientPacks ids)'),
      showAllLabel: z.string().describe('Button that opens the full list'),
      showLessLabel: z.string().describe('Button that folds it back to one row'),
    })
    .optional()
    .describe('Optional: packs shown at the top of the Products section (one row, then "Show all")'),
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

/** The extra sections the Gallery page can show (as buttons next to its title). */
export const galleryTabIds = ['machinery', 'products'] as const;

export const gallerySchema = z.object({
  tabs: z
    .array(
      z.object({
        id: z.enum(galleryTabIds).describe('Section'),
        label: z.string().describe('Button text'),
      }),
    )
    .describe('Buttons next to the Gallery title (in order). Remove one to hide that section.'),
  closeLabel: z.string().describe('Read out for the ✕ button that closes an open section'),
  videos: z
    .array(z.object({ src: mediaPath, poster: mediaPath, caption: z.string().describe('Caption') }))
    .describe('Videos (the first one is shown large)'),
  photos: z.array(z.object({ src: mediaPath, caption: z.string() })),
});

/** A certificate (e.g. food safety or quality), shown in the Certifications section of each unit it covers. */
export const certificationSchema = z.object({
  id: slug,
  name: z.string().describe('Certificate name'),
  issuer: z.string().describe('Issued by'),
  description: z.string().describe('What it covers'),
  validUntil: z.string().optional().describe('Valid until, e.g. March 2027'),
  image: mediaPath.optional().describe('Certificate or logo image (optional)'),
  units: z.array(slug).min(1).describe('Units it covers (unit ids)'),
  order: z.number().int().describe('Display order'),
});

/** Promoter Profile page ("/promoter-profile"): the people behind the company. */
export const promotersSchema = z.object({
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Title'),
  intro: z.string().describe('Text under the title'),
  people: z
    .array(
      z.object({
        name: z.string().describe('Name'),
        role: z.string().describe('Role, e.g. Managing Director'),
        photo: mediaPath.optional().describe('Photo (optional; initials are shown without one)'),
        bio: z.string().describe('Profile'),
        highlights: z.array(z.string()).describe('Key points (experience, achievements)'),
      }),
    )
    .describe('Promoters'),
});

/** Supply Chain (Unit 2 → Supply Chain): a 3D scene of the dispatch dock, then trucks driving across an India map. */
const latLon = z.tuple([z.number().describe('Latitude'), z.number().describe('Longitude')]);
export const supplyChainSchema = z.object({
  eyebrow: z.string().describe('Small text above the title'),
  title: z.string().describe('Title'),
  intro: z.string().describe('Text under the title'),
  steps: z
    .array(z.string())
    .length(3)
    .describe('The three step labels above the scene: loading, dispatched, delivered'),
  mapOutline: mediaPath.describe(
    'India outline (SVG with one path; mainland first, then each island as its own M…Z part; x = longitude, y = minus latitude)',
  ),
  origin: z.object({
    name: z.string().describe('Plant name'),
    city: z.string().describe('City, e.g. Hyderabad (Patancheru), Telangana'),
    mapLabel: z.string().describe('Label next to the plant on the map'),
    lat: z.number().describe('Latitude'),
    lon: z.number().describe('Longitude'),
  }),
  destinations: z
    .array(
      z.object({
        city: z.string().describe('City'),
        region: z.string().describe('Region, e.g. North'),
        lat: z.number().describe('Latitude'),
        lon: z.number().describe('Longitude'),
        via: z
          .array(latLon)
          .describe('Highway waypoints between the plant and the city (latitude, longitude)'),
        labelSide: z
          .enum(['left', 'right', 'top', 'bottom'])
          .describe('Where the city name sits next to its pin'),
      }),
    )
    .min(1)
    .describe('Cities the trucks deliver to'),
  chapters: z
    .array(
      z.object({
        kind: z
          .enum(['loading', 'dispatch', 'region', 'delivered'])
          .describe(
            'loading = dock scene; dispatch = truck leaves; region = deliveries to some cities; delivered = final map',
          ),
        railLabel: z.string().describe('Short label on the progress bar'),
        speed: z
          .number()
          .min(0.25)
          .max(5)
          .optional()
          .describe('Playback speed of this chapter (1 = normal, 2.2 = 2.2 times faster)'),
        title: z.string().describe('Title in the side panel'),
        caption: z.string().describe('Caption on the scene'),
        text: z.string().describe('Text in the side panel'),
        cities: z
          .array(z.string())
          .optional()
          .describe('Region chapters: the cities delivered in this chapter'),
        camera: z
          .object({
            lat: z.number().describe('Look at latitude'),
            lon: z.number().describe('Look at longitude'),
            distance: z.number().describe('Camera distance (bigger = further away)'),
            turn: z.number().describe('Camera turn in radians (small numbers, e.g. -0.12)'),
          })
          .optional()
          .describe('Region chapters: where the camera looks'),
      }),
    )
    .min(4)
    .describe('Chapters, in order: loading, dispatch, one or more regions, delivered'),
  regions: z
    .array(z.object({ label: z.string().describe('Text'), lat: z.number(), lon: z.number() }))
    .describe('Region names shown on the final map'),
  stats: z.array(stat).describe('Numbers shown when everything is delivered'),
  labels: z
    .object({
      stage: z.string().describe('Description of the scene for screen readers'),
      loadMeter: z.string().describe('Load meter label on the scene, e.g. Pallets'),
      loadedTag: z.string().describe('Tag shown when the truck is sealed'),
      chapter: z.string().describe('Word before the chapter number'),
      loadFactor: z.string().describe('Panel row: load factor'),
      palletsOnDock: z.string().describe('Panel row: pallets still on the dock'),
      truckStatus: z.string().describe('Panel row: truck status'),
      statusLoading: z.string().describe('Status while loading'),
      statusSealed: z.string().describe('Status once doors are sealed'),
      statusDeparted: z.string().describe('Status once the truck leaves'),
      delivered: z.string().describe('Panel row: delivered count, and the tag under each city'),
      onRoad: z.string().describe('Panel row: trucks on the road'),
      distance: z.string().describe('Panel row: distance covered'),
      km: z.string().describe('Unit after distances, e.g. km'),
      play: z.string().describe('Play button'),
      pause: z.string().describe('Pause button'),
      previous: z.string().describe('Previous chapter button (screen readers)'),
      next: z.string().describe('Next chapter button (screen readers)'),
      replay: z.string().describe('Replay button'),
      autoAdvance: z.string().describe('Auto-advance checkbox'),
      note: z.string().optional().describe('Small note under the controls (optional)'),
      noWebgl: z.string().describe('Shown when the browser cannot draw 3D'),
    })
    .describe('Words used on the page'),
});

/**
 * Marico pitch ("/marico"): a PIN screen, then an animated 16:9 film, scene by scene, with PDF / PowerPoint download.
 * Each scene `kind` has its own animation (src/pages/marico-film.ts); the words and numbers come from here.
 */
const filmCaption = {
  rail: z.string().describe('Short name on the progress bar and in the controls'),
  seconds: z.number().min(3).max(60).describe('How long the scene plays before moving on (seconds)'),
  eyebrow: z.string().optional().describe('Small text above the caption title, e.g. 01 · Investment'),
  title: z.string().optional().describe('Caption title (bottom left of the film)'),
  line: z.string().optional().describe('Caption text under the title'),
  stats: z
    .array(
      z.object({ value: z.string().describe('Value, e.g. ₹160 Cr+'), label: z.string().describe('Label') }),
    )
    .optional()
    .describe('Figures in the caption'),
};
const filmSceneSchema = z.discriminatedUnion('kind', [
  z.object({
    ...filmCaption,
    kind: z.literal('title'),
    eyebrow: z.string().describe('Small text above the headline'),
    headline: z.string().describe('Big headline'),
    subtitle: z.string().describe('Text under the headline'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('machinery'),
    groups: z
      .array(
        z.object({
          count: z.number().int().min(1).max(60).describe('How many'),
          label: z.string().describe('Label'),
        }),
      )
      .length(4)
      .describe('In order: packaging lines, ball mills, premixing systems, blenders'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('range'),
    items: z
      .array(
        z.object({
          name: z.string().describe('Name'),
          icon: z.enum(['coffee', 'nutrition', 'confectionery', 'dry', 'wet']).describe('Picture'),
        }),
      )
      .min(1)
      .max(6)
      .describe('Product families'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('products'),
    heading: z.string().describe('Heading over the turning packs'),
    rotationSeconds: z.number().min(10).max(600).describe('Seconds for one full turn (bigger = slower)'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('packaging'),
    readoutLabel: z.string().describe('Small label over the weight readout, e.g. PACK SIZE'),
    rangeLabel: z.string().describe('Readout shown once the scale is full, e.g. 0.4 – 25 kg'),
    minGrams: z.number().positive().describe('Left end of the scale (grams)'),
    maxGrams: z.number().positive().describe('Right end of the scale (grams)'),
    packs: z
      .array(
        z.object({
          label: z.string().describe('Label'),
          grams: z.number().positive().describe('Where it sits on the scale (grams)'),
          shape: z.enum(['stick', 'bar', 'jar', 'tin', 'bulk']).describe('Picture'),
        }),
      )
      .min(1)
      .describe('Pack formats on the scale'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('steps'),
    steps: z
      .array(z.string())
      .length(5)
      .describe('In order: production, quality, packaging, warehousing, dispatch'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('clients'),
    first: z
      .array(z.string())
      .min(1)
      .max(3)
      .describe('Clients shown first, on the right (names from Client logos)'),
    more: z.array(z.string()).max(3).describe('Clients added next, on the left (names from Client logos)'),
    captions: z
      .record(z.string(), z.string())
      .optional()
      .describe('Optional: name to print under a logo, by client name (e.g. Unilever → Hindustan Unilever)'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('handover'),
    makerLabel: z.string().describe('Under the KJS factory, e.g. Manufacturing'),
    partnerName: z.string().describe('Partner name on its card, e.g. MARICO'),
    partnerLabel: z.string().describe('Under the partner card, e.g. Distribution network'),
    partnerLogo: mediaPath.optional().describe('Optional: partner logo, shown instead of the name'),
    channels: z
      .array(z.object({ name: z.string().describe('Name'), sub: z.string().describe('Small text under it') }))
      .length(2)
      .describe('In order: Modern Trade (supermarket picture), General Trade (shop picture)'),
    shopSign: z.string().describe('Sign on the supermarket picture'),
  }),
  z.object({
    ...filmCaption,
    kind: z.literal('map'),
    originLabel: z.string().describe('Label next to the plant on the map'),
    counters: z
      .array(
        z.object({
          value: z.number().describe('Number counted up to'),
          suffix: z.string().optional().describe('After the number, e.g. +'),
          label: z.string().describe('Label'),
        }),
      )
      .max(3)
      .describe('Numbers counting up beside the map (cities, regions, km)'),
    note: z.string().optional().describe('Small note in the corner, e.g. Routes are illustrative'),
  }),
]);
export const maricoSchema = z.object({
  pageTitle: z.string().describe('Browser tab title'),
  lock: z.object({
    title: z.string().describe('Title on the PIN screen'),
    text: z.string().describe('Text on the PIN screen'),
    error: z.string().describe('Shown after a wrong PIN'),
    pinLength: z.number().int().min(4).max(8).describe('Number of digits'),
    pinHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'A SHA-256 hash (64 hex characters)')
      .describe('SHA-256 of the PIN (never the PIN itself)'),
  }),
  labels: z
    .object({
      stage: z.string().describe('Description of the film for screen readers'),
      back: z.string().describe('Back button'),
      next: z.string().describe('Next button'),
      play: z.string().describe('Play button'),
      pause: z.string().describe('Pause button'),
      restart: z.string().describe('Restart button'),
      fullScreen: z.string().describe('Full screen button'),
      exitFullScreen: z.string().describe('Exit full screen button'),
      autoAdvance: z.string().describe('Auto-advance checkbox'),
      scene: z.string().describe('Word before the scene number, e.g. Scene'),
      of: z.string().describe('Word between scene numbers, e.g. of'),
      downloadPdf: z.string().describe('Download as PDF button'),
      downloadPpt: z.string().describe('Download as PowerPoint button'),
      preparing: z.string().describe('Shown while a download is being made'),
      downloadFailed: z.string().describe('Shown on the button for a few seconds if a download fails'),
      fileName: z.string().describe('Downloaded file name, without .pdf / .pptx'),
    })
    .describe('Words used on the page'),
  scenes: z.array(filmSceneSchema).min(1).describe('Scenes, in order'),
});

/** Slides are a "discriminated union": each `kind` has its own fields. Add a new kind here to add a new slide layout. */
const slideBase = { id: slug, title: z.string(), summary: z.string().optional() };
export const slideSchema = z.discriminatedUnion('kind', [
  z.object({ ...slideBase, kind: z.literal('cover'), image: mediaPath }),
  z.object({ ...slideBase, kind: z.literal('facts'), items: z.array(titleBody) }),
  z.object({ ...slideBase, kind: z.literal('logos') }),
  z.object({ ...slideBase, kind: z.literal('products'), productIds: z.array(slug) }),
]);

/** Every content section. Each key is one row in the database (sections table) and one form in the admin page. */
// The section names (describe) are what the admin page shows in its sidebar.
export const contentSections = z.object({
  site: siteSchema.describe('Site settings'),
  home: homeSchema.describe('Home page'),
  productsPage: productsPageSchema.describe('Products (in Gallery)'),
  units: z.array(unitSchema).describe('Units'),
  products: z.array(productSchema).describe('Products'),
  clientPacks: z.array(clientPackSchema).describe('Client packs'),
  machinery: z.array(machinerySchema).describe('Machinery'),
  gallery: gallerySchema.describe('Gallery'),
  supplyChain: supplyChainSchema.describe('Supply chain'),
  certifications: z.array(certificationSchema).describe('Certifications'),
  promoters: promotersSchema.describe('Promoter profile'),
  marico: maricoSchema.describe('Marico pitch'),
  slides: z.array(slideSchema).describe('Presentation slides'),
});

export type SectionKey = keyof typeof contentSections.shape;
export const sectionKeys = Object.keys(contentSections.shape) as SectionKey[];

/** The whole site: all sections, plus checks that span sections (e.g. a product must point at a real unit). */
export const contentSchema = contentSections
  .superRefine((c, ctx) => {
    const themeIds = c.site.theme.palettes.map((p) => p.id);
    if (!themeIds.includes(c.site.theme.default))
      ctx.addIssue({
        code: 'custom',
        path: ['site', 'theme', 'default'],
        message: `Unknown theme "${c.site.theme.default}"`,
      });
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
    const packIds = new Set(c.clientPacks.map((p) => p.id));
    c.units.forEach((u, i) =>
      u.productPacks?.packs.forEach((id, j) => {
        if (!packIds.has(id))
          ctx.addIssue({
            code: 'custom',
            message: `No client pack with id "${id}"`,
            path: ['units', i, 'productPacks', 'packs', j],
          });
      }),
    );
    c.certifications.forEach((cert, i) =>
      cert.units.forEach((u, j) => {
        if (!unitIds.has(u))
          ctx.addIssue({
            code: 'custom',
            path: ['certifications', i, 'units', j],
            message: `Unknown unit "${u}"`,
          });
      }),
    );
    const cities = new Set(c.supplyChain.destinations.map((d) => d.city));
    c.supplyChain.chapters.forEach((ch, i) =>
      (ch.cities ?? []).forEach((city, j) => {
        if (!cities.has(city))
          ctx.addIssue({
            code: 'custom',
            path: ['supplyChain', 'chapters', i, 'cities', j],
            message: `Unknown destination "${city}"`,
          });
      }),
    );
    const partnerNames = new Set(c.site.partners.map((p) => p.name));
    c.marico.scenes.forEach((s, i) => {
      if (s.kind !== 'clients') return;
      (['first', 'more'] as const).forEach((key) =>
        s[key].forEach((name, j) => {
          if (!partnerNames.has(name))
            ctx.addIssue({
              code: 'custom',
              path: ['marico', 'scenes', i, key, j],
              message: `No client logo named "${name}"`,
            });
        }),
      );
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
export type UnitTabId = (typeof unitTabIds)[number];
export type GalleryTabId = (typeof galleryTabIds)[number];
export type Slide = Content['slides'][number];
export type SupplyChain = Content['supplyChain'];
export type Marico = Content['marico'];
export type FilmScene = Marico['scenes'][number];
export type Certification = Content['certifications'][number];
