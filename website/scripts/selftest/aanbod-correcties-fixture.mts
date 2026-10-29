/**
 * The database before 27 Oct 2026, as staging and production hold it, written
 * into the throwaway PGlite for self-test section 17d (`aanbod-correcties.mts`):
 *
 *  - settings: the old address ("Ninove"), the old phone number, the old SEO
 *    default texts, no `business` and no `rules` row; the other groups at their
 *    defaults;
 *  - the default studio location without a street; the main menu without
 *    "Cadeaubon";
 *  - the nine offerings with the text they had (`from` of the corrections), the
 *    current-bike fit booked online as Volwassene and Jeugd, the voetanalyse
 *    booked online with a 60-minute service (the Beheer prefill);
 *  - the two booking services with the old name, label and description, Jeugdfit
 *    still asking for a parent or guardian (until 29 Oct 2026);
 *  - two providers, Toshoni and Winston, who both offer the three services;
 *  - every page the patch needs, published, with the old texts and the old
 *    phone number, a retired contact page (draft, old number) and a retired
 *    page with a block type that no longer exists (draft).
 *
 * Starts from a clean slate (`snapshotState` has the rest), so the section does
 * not depend on what the sections before it left behind. Test data only.
 */
import * as orm from 'drizzle-orm';
import * as offeringSchema from '@/db/cms-offering-schema';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { defaultDataFor, SITE_SETTING_KEYS, siteSettingSchemas } from '@/lib/cms/blocks';
import {
  OFFERING_TEXT_CORRECTIONS,
  SERVICE_TEXT_CORRECTIONS,
} from '@/lib/offers/corrections-2026-10-27';
import { AANBOD_PAGES, MAIN_MENU } from '@/lib/studio/seed-content/aanbod';
import { AFSPRAAK_PAGE } from '@/lib/studio/seed-content/appointment';
import { CADEAUBON_PAGE, CADEAUBON_PATH } from '@/lib/studio/seed-content/cadeaubon';
import {
  PHONE_HREF_BEFORE,
  PHONE_LABEL_BEFORE,
  SETTING_TEXT_CORRECTIONS,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import { CONTACT_EMAIL } from '@/lib/studio/seed-content/shared';
import { oldPageTexts, pageFixture } from '../lib/aanbod-correcties-before.mjs';
import { requiredPageSlugs } from '../lib/aanbod-correcties-pages.mjs';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
import { ensureDefaultOfferings } from '../lib/offerings-bootstrap.mjs';
import type { CorrectiesKit, CorrectiesSectionContext } from './aanbod-correcties-kit.mjs';

const { and, eq } = orm;

/** Instellingen → Contact on 26 Oct 2026. */
export const CONTACT_BEFORE = {
  phoneLabel: PHONE_LABEL_BEFORE,
  phoneHref: PHONE_HREF_BEFORE,
  email: CONTACT_EMAIL,
  addressLines: [] as string[],
  postalCode: '',
  city: 'Ninove',
  country: 'BE',
  hours: 'Op afspraak',
  website: 'www.debikefitstudio.be',
};

export type Fixture = {
  studioId: string;
  toshoniId: string;
  winstonId: string;
  voetanalyseServiceId: string;
  pageIds: Record<string, string>;
};

export async function seedBefore(
  kit: CorrectiesKit,
  ctx: Pick<CorrectiesSectionContext, 'cookieJar' | 'admin'>,
): Promise<Fixture> {
  const { db, schema, locale } = kit;

  // --- settings --------------------------------------------------------------------
  const setting = async (key: string, value: unknown) => {
    await db
      .insert(schema.cmsSiteSettings)
      .values({ locale, key, value })
      .onConflictDoUpdate({
        target: [schema.cmsSiteSettings.locale, schema.cmsSiteSettings.key],
        set: { value },
      });
  };
  for (const key of SITE_SETTING_KEYS) {
    if (key === 'business' || key === 'rules') continue;
    await setting(key, siteSettingSchemas[key].parse({}));
  }
  await setting('contact', CONTACT_BEFORE);
  await setting('seo', {
    ...siteSettingSchemas.seo.parse({}),
    ...Object.fromEntries(SETTING_TEXT_CORRECTIONS.map((entry) => [entry.field, entry.from])),
  });
  await db
    .delete(schema.cmsSiteSettings)
    .where(
      and(
        eq(schema.cmsSiteSettings.locale, locale),
        orm.inArray(schema.cmsSiteSettings.key, ['business', 'rules']),
      ),
    );

  // --- the studio location and the menu -------------------------------------------------
  const [defaultStudio] = await db
    .select()
    .from(schema.cmsLocations)
    .where(and(eq(schema.cmsLocations.kind, 'studio'), eq(schema.cmsLocations.isDefault, true)))
    .limit(1);
  const studio =
    defaultStudio ??
    (
      await db
        .insert(schema.cmsLocations)
        .values({ name: 'De Bikefit Studio, Ninove', kind: 'studio', isDefault: true })
        .returning()
    )[0];
  const studioId = studio.id;
  await db
    .update(schema.cmsLocations)
    .set({ addressLines: [], postalCode: '', city: 'Ninove', country: 'BE' })
    .where(eq(schema.cmsLocations.id, studioId));
  const menu = MAIN_MENU.filter((item) => item.href !== CADEAUBON_PATH);
  await db.delete(schema.cmsNavigation).where(eq(schema.cmsNavigation.menuKey, 'main'));
  await db.insert(schema.cmsNavigation).values({ locale, menuKey: 'main', items: menu });

  // --- the booking services ---------------------------------------------------------------
  await db.delete(offeringSchema.cmsOfferings);
  for (const service of DEFAULT_SERVICES) {
    const [existing] = await db
      .select({ id: schema.cmsServices.id })
      .from(schema.cmsServices)
      .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, service.slug)));
    const values = {
      priceCents: service.priceCents,
      showPrice: service.showPrice,
      durationMinutes: 120,
      bufferAfterMinutes: 15,
      // As staging and production hold it: Jeugdfit asked for a guardian until 29 Oct 2026.
      requiresGuardian: service.slug === 'jeugdfit',
      isActive: true,
      sortOrder: service.sortOrder,
    };
    const old = SERVICE_TEXT_CORRECTIONS.find((entry) => entry.slug === service.slug)?.from;
    const text = old ?? {
      name: service.name,
      choiceLabel: service.choiceLabel,
      description: service.description,
    };
    if (existing) {
      await db
        .update(schema.cmsServices)
        .set({ ...values, ...text })
        .where(eq(schema.cmsServices.id, existing.id));
    } else {
      await db
        .insert(schema.cmsServices)
        .values({ locale, slug: service.slug, ...values, ...text });
    }
  }
  const [voetanalyseService] = await db
    .insert(schema.cmsServices)
    .values({
      locale,
      slug: 'voetanalyse',
      name: 'Voetanalyse',
      durationMinutes: 60, // the prefill of Beheer → Aanbod
      bufferAfterMinutes: 15,
      priceCents: 8500,
      showPrice: true,
    })
    .onConflictDoUpdate({
      target: [schema.cmsServices.locale, schema.cmsServices.slug],
      set: { durationMinutes: 60 },
    })
    .returning({ id: schema.cmsServices.id });

  // --- the nine offerings, with the text they had ---------------------------------------------
  await ensureDefaultOfferings({
    db,
    orm,
    schema: { cmsServices: schema.cmsServices, DEFAULT_LOCALE: locale },
    offerings: offeringSchema,
    log: () => {},
  });
  for (const correction of OFFERING_TEXT_CORRECTIONS) {
    await db
      .update(offeringSchema.cmsOfferings)
      .set(correction.from)
      .where(
        and(
          eq(offeringSchema.cmsOfferings.locale, locale),
          eq(offeringSchema.cmsOfferings.slug, correction.slug),
        ),
      );
  }
  const [foot] = await db
    .select({ id: offeringSchema.cmsOfferings.id })
    .from(offeringSchema.cmsOfferings)
    .where(eq(offeringSchema.cmsOfferings.slug, 'voetanalyse'));
  await db
    .update(offeringSchema.cmsOfferings)
    .set({ bookingMode: 'direct' })
    .where(eq(offeringSchema.cmsOfferings.id, foot.id));
  await db
    .update(offeringSchema.cmsOfferingVariants)
    .set({ serviceId: voetanalyseService.id })
    .where(eq(offeringSchema.cmsOfferingVariants.offeringId, foot.id));

  // --- the providers: Toshoni and Winston both offer the three services -----------------------
  await db.delete(schema.cmsProviderServices);
  const providerIds: Record<string, string> = {};
  for (const name of ['Toshoni', 'Winston']) {
    const [user] = await db
      .insert(schema.cmsUsers)
      .values({
        email: `${name.toLowerCase()}-17d@selftest.local`,
        name,
        role: 'provider',
        passwordHash: 'not-a-hash',
      })
      .returning({ id: schema.cmsUsers.id });
    const [provider] = await db
      .insert(schema.cmsProviders)
      .values({ userId: user.id, displayName: name, defaultLocationId: studioId })
      .returning({ id: schema.cmsProviders.id });
    providerIds[name] = provider.id;
  }
  const offered = await db
    .select({ id: schema.cmsServices.id, slug: schema.cmsServices.slug })
    .from(schema.cmsServices)
    .where(
      and(
        eq(schema.cmsServices.locale, locale),
        orm.inArray(schema.cmsServices.slug, ['volwassenenfit', 'jeugdfit', 'voetanalyse']),
      ),
    );
  for (const [name, providerId] of Object.entries(providerIds)) {
    for (const service of offered) {
      await db.insert(schema.cmsProviderServices).values({
        providerId,
        serviceId: service.id,
        // Winston offers the youth fit from the studio.
        locationId: name === 'Winston' && service.slug === 'jeugdfit' ? studioId : null,
      });
    }
  }

  // --- the pages -------------------------------------------------------------------------------
  const pageIds: Record<string, string> = {};
  const seeds = [...AANBOD_PAGES, AFSPRAAK_PAGE, CADEAUBON_PAGE];
  await db.delete(schema.cmsPages); // what the sections before left; `snapshotState` gives it back
  const writePage = async (
    slug: string,
    blocks: ReadonlyArray<{ type: string; data: Record<string, unknown> }>,
    texts: {
      title?: string;
      metaTitle?: string | null;
      metaDescription?: string | null;
      ogDescription?: string | null;
    },
  ) => {
    await db
      .delete(schema.cmsPages)
      .where(and(eq(schema.cmsPages.locale, locale), eq(schema.cmsPages.slug, slug)));
    const [page] = await db
      .insert(schema.cmsPages)
      .values({
        locale,
        slug,
        translationGroup: slug || 'home',
        title: texts.title ?? slug,
        metaTitle: texts.metaTitle ?? null,
        metaDescription: texts.metaDescription ?? null,
        ogDescription: texts.ogDescription ?? null,
      })
      .returning({ id: schema.cmsPages.id });
    if (blocks.length > 0) {
      await db
        .insert(schema.cmsBlocks)
        .values(blocks.map((block, index) => ({ pageId: page.id, sortOrder: index, ...block })));
    }
    pageIds[slug] = page.id;
    return page.id;
  };

  await withAdminSession(
    { db, cookieJar: ctx.cookieJar },
    ctx.admin.id,
    'cms-selftest-17d',
    async () => {
      const repo = await import('@/lib/cms/repo');
      for (const slug of requiredPageSlugs()) {
        const seed = seeds.find((entry) => entry.slug === slug);
        const old = oldPageTexts(slug);
        const id = await writePage(slug, pageFixture(slug).old, {
          title: seed?.title ?? slug,
          metaTitle: old.metaTitle ?? seed?.metaTitle ?? null,
          metaDescription: old.metaDescription ?? seed?.metaDescription ?? null,
          ogDescription: slug === '' ? `Bel ${PHONE_LABEL_BEFORE}` : null,
        });
        const published = await repo.publishPage(id);
        if (!published.ok) throw new Error(`17d fixture: /${slug}: ${published.message}`);
      }
    },
  );

  // Retired pages: never published again, so only their drafts are looked at.
  await writePage(
    'contact',
    [
      {
        type: 'contact',
        data: {
          ...defaultDataFor('contact'),
          phoneLabel: PHONE_LABEL_BEFORE,
          phoneHref: PHONE_HREF_BEFORE,
        },
      },
    ],
    { title: 'Contact' },
  );
  await writePage(
    'over-ons',
    [{ type: 'offer', data: { title: 'Oud', body: PHONE_LABEL_BEFORE } }],
    {
      title: 'Over ons',
    },
  );

  return {
    studioId,
    toshoniId: providerIds.Toshoni,
    winstonId: providerIds.Winston,
    voetanalyseServiceId: voetanalyseService.id,
    pageIds,
  };
}
