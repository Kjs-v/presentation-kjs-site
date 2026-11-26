/**
 * Publishing while someone else saves (code review, 2026-11-27).
 * Publish checks every draft together, then makes them live. If another save lands in between,
 * the unchecked draft must not go live. The database is wrapped so that save happens at the worst moment:
 * right before publish writes.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

let beforeBatch: (() => Promise<void>) | undefined;

vi.mock('../server/db/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../server/db/client')>();
  return {
    ...real,
    db: () => {
      const target = real.db();
      return new Proxy(target, {
        get(t, prop) {
          const value = Reflect.get(t, prop);
          if (prop === 'batch' && beforeBatch) {
            const hook = beforeBatch;
            beforeBatch = undefined;
            return async (queries: Parameters<typeof t.batch>[0]) => {
              await hook();
              return t.batch(queries);
            };
          }
          return typeof value === 'function' ? value.bind(t) : value;
        },
      });
    },
  };
});

const { db, schema } = await import('../server/db/client');
const { PASSWORDS, call, loginAs, resetDatabase } = await import('./helpers');
const { contentSchema } = await import('../content/content.schema');

let admin = '';
beforeAll(async () => {
  await resetDatabase();
  admin = await loginAs('admin@test.local', PASSWORDS.admin);
});

describe('publish during a save', () => {
  it('never puts an unchecked draft live', async () => {
    // A draft that is fine on its own but breaks the whole site (a product in a unit that doesn't exist).
    beforeBatch = async () => {
      const [row] = await db().select().from(schema.sections).where(eq(schema.sections.key, 'products'));
      const broken = structuredClone(row.draft) as { unit: string }[];
      broken[0].unit = 'unit-99';
      await db().update(schema.sections).set({ draft: broken }).where(eq(schema.sections.key, 'products'));
    };
    const pub = await call('POST', '/api/admin/publish', { cookie: admin, body: { note: 'race' } });
    expect(pub.status).toBe(200);
    const live = (await call('GET', '/api/content')).data;
    expect(contentSchema.safeParse(live).success).toBe(true);
    expect(live.products[0].unit).not.toBe('unit-99');
  });
});
