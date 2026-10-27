/**
 * The default offerings (`src/lib/offers/defaults.ts`) on a database: one
 * `cms_offerings` row per slug that is missing, with its variants (Volwassene,
 * Jeugd – eenmalig, Jeugd – volledig pakket where an offering splits by
 * audience) linked to the bootstrap services by slug. Shared by
 * `cms-bootstrap.mts` and the self-test. Create-only and idempotent: an
 * existing offering (by locale and
 * slug) is never touched, whatever it holds. Direct database writes, like the
 * rest of the bootstrap (no session, no audit); nothing touches
 * `cms_services`, `cms_provider_services` or `cms_bookings`. The extras of a
 * created offering (20 Oct 2026: the three columns and the links to the
 * extras it allows, by slug) are written with it; an existing offering keeps
 * what it has (`npm run cms:patch-aanbod-extras` fills those in).
 *
 * Plain imports only: this module runs before any request-context stub.
 */
import type { CmsDatabase } from '@/db/cms';
import { DEFAULT_OFFERINGS, type DefaultOffering } from '@/lib/offers/defaults';

type Orm = typeof import('drizzle-orm');
type OfferingSchema = typeof import('@/db/cms-offering-schema');
type CmsSchema = typeof import('@/db/cms-schema');

export type EnsureOfferingsDeps = {
  db: CmsDatabase;
  orm: Pick<Orm, 'and' | 'eq'>;
  schema: Pick<CmsSchema, 'cmsServices' | 'DEFAULT_LOCALE'>;
  offerings: Pick<OfferingSchema, 'cmsOfferings' | 'cmsOfferingVariants' | 'cmsOfferingAddons'>;
  log: (symbol: string, message: string) => void;
  locale?: string;
};

export async function ensureDefaultOfferings(
  deps: EnsureOfferingsDeps,
  defaults: readonly DefaultOffering[] = DEFAULT_OFFERINGS,
): Promise<{ created: string[]; kept: string[] }> {
  const { db, orm, schema, offerings, log } = deps;
  const { and, eq } = orm;
  const locale = deps.locale ?? schema.DEFAULT_LOCALE;
  const services = await db
    .select({ id: schema.cmsServices.id, slug: schema.cmsServices.slug })
    .from(schema.cmsServices)
    .where(eq(schema.cmsServices.locale, locale));
  const serviceId = new Map(services.map((row) => [row.slug, row.id]));

  const created: string[] = [];
  const kept: string[] = [];
  for (const entry of defaults) {
    const { content } = entry;
    const [existing] = await db
      .select({ id: offerings.cmsOfferings.id })
      .from(offerings.cmsOfferings)
      .where(
        and(
          eq(offerings.cmsOfferings.locale, locale),
          eq(offerings.cmsOfferings.slug, content.slug),
        ),
      )
      .limit(1);
    if (existing) {
      kept.push(content.slug);
      log('=', `offering ${locale}/${content.slug} already exists — left untouched`);
      continue;
    }
    const [row] = await db
      .insert(offerings.cmsOfferings)
      .values({
        locale,
        slug: content.slug,
        category: content.category,
        sortOrder: content.sortOrder,
        title: content.title,
        summary: content.summary,
        intro: content.intro,
        goal: content.goal,
        contents: content.contents,
        extras: content.extras,
        extrasNote: content.extrasNote,
        duration: content.duration,
        priceText: content.priceText,
        ctaLabel: content.ctaLabel,
        image: content.image,
        metaDescription: content.metaDescription,
        pageId: null,
        isListed: entry.isListed,
        bookingMode: entry.bookingMode,
        variantMode: entry.variantMode,
        isAddon: entry.isAddon,
        soldAlone: entry.soldAlone,
        addonMinutes: entry.addonMinutes,
        addonOptions: entry.addonOptions,
      })
      .returning({ id: offerings.cmsOfferings.id });
    const linked: string[] = [];
    for (const variant of entry.variants) {
      const id = variant.serviceSlug ? (serviceId.get(variant.serviceSlug) ?? null) : null;
      if (variant.serviceSlug && !id) {
        log(
          '!',
          `offering ${content.slug}: service ${variant.serviceSlug} is missing — variant saved without a service`,
        );
      }
      if (id) linked.push(variant.serviceSlug!);
      await db.insert(offerings.cmsOfferingVariants).values({
        offeringId: row.id,
        audience: variant.audience,
        serviceId: id,
        priceCents: variant.priceCents,
      });
    }
    created.push(content.slug);
    log(
      '+',
      `offering ${locale}/${content.slug} created (${entry.isListed ? 'shown' : 'hidden'}, ${entry.bookingMode}${
        linked.length ? `, services ${linked.join(' + ')}` : ''
      })`,
    );
  }

  // The extras a created offering allows, by slug: both sides exist by now.
  const hosts = defaults.filter(
    (entry) => created.includes(entry.content.slug) && entry.addonSlugs.length > 0,
  );
  if (hosts.length > 0) {
    const rows = await db
      .select({ id: offerings.cmsOfferings.id, slug: offerings.cmsOfferings.slug })
      .from(offerings.cmsOfferings)
      .where(eq(offerings.cmsOfferings.locale, locale));
    const offeringId = new Map(rows.map((row) => [row.slug, row.id]));
    for (const entry of hosts) {
      const hostId = offeringId.get(entry.content.slug);
      if (!hostId) continue;
      const linked: string[] = [];
      for (const slug of entry.addonSlugs) {
        const addonId = offeringId.get(slug);
        if (!addonId) {
          log('!', `offering ${entry.content.slug}: extra ${slug} is missing — not linked`);
          continue;
        }
        await db
          .insert(offerings.cmsOfferingAddons)
          .values({ offeringId: hostId, addonId, sortOrder: linked.length })
          .onConflictDoNothing();
        linked.push(slug);
      }
      if (linked.length) {
        log('~', `offering ${locale}/${entry.content.slug}: extras ${linked.join(' + ')}`);
      }
    }
  }
  return { created, kept };
}
