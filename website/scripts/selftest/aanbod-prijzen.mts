/**
 * Self-test section 17b: `cms:patch-aanbod-prijzen` on the throwaway PGlite of
 * `cms-selftest.mts`, after the offerings (14d) and page-cleanup (17) sections.
 *
 * Section 14d removes the offerings it made, so this one bootstraps the nine
 * defaults again (`ensureDefaultOfferings`, the 20 Oct 2026 values), puts the
 * database in the state of 17–19 Oct (the `from` side of
 * `src/lib/offers/aanbod-prices.ts`), then:
 * 1. the dry run writes nothing;
 * 2. apply writes exactly the planned fields, creates the two new offerings,
 *    prices the two services, audits, leaves the booking tables' counts alone;
 * 3. the public catalogue shows the prices and durations;
 * 4. a second apply changes nothing; restore puts the old state back; apply
 *    again (so later sections find the current defaults);
 * 5. a field an admin changed since blocks the patch, and is put back;
 * 6. clean-up: the offerings go again and the two services get their bootstrap
 *    name and description back, so later sections find the database as before.
 *
 * Imported lazily by `cms-selftest.mts` after its request-context stubs.
 */
import * as orm from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import {
  NEW_OFFERING_SLUGS,
  OFFERING_PRICE_CHANGES,
  SERVICE_PRICE_CHANGES,
} from '@/lib/offers/aanbod-prices';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatPrice } from '@/lib/booking/format';
import { runAanbodPricesPatch } from '../lib/aanbod-prices-patch.mjs';
import { ensureDefaultOfferings } from '../lib/offerings-bootstrap.mjs';

type Check = (label: string, condition: boolean, detail?: string) => void;

export async function aanbodPrijzenSection(ctx: {
  db: CmsDatabase;
  check: Check;
  section: (title: string) => void;
  cookieJar: Map<string, string>;
  backupDir: string;
}) {
  const { db, check, section, cookieJar, backupDir } = ctx;
  section('17b. aanbod prices patch (20 Oct 2026)');

  const schema = await import('@/db/cms-schema');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const locale = schema.DEFAULT_LOCALE;
  const { and, eq } = orm;
  const lines: string[] = [];
  const log = (symbol: string, message: string) => {
    lines.push(`${symbol} ${message}`);
  };
  const run = (options: { apply: boolean; restore: string | null }) => {
    lines.length = 0;
    return runAanbodPricesPatch(
      { ...options, backupDir },
      { db, driver: 'pglite', cookieJar, log },
    );
  };
  const offeringRow = async (slug: string) => {
    const [row] = await db
      .select()
      .from(cmsOfferings)
      .where(and(eq(cmsOfferings.locale, locale), eq(cmsOfferings.slug, slug)))
      .limit(1);
    return row ?? null;
  };
  const serviceRow = async (slug: string) => {
    const [row] = await db
      .select()
      .from(schema.cmsServices)
      .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, slug)))
      .limit(1);
    return row ?? null;
  };
  const counts = async () => {
    const [bookings, services, providers] = await Promise.all([
      db.select({ id: schema.cmsBookings.id }).from(schema.cmsBookings),
      db.select({ id: schema.cmsServices.id }).from(schema.cmsServices),
      db.select({ id: schema.cmsProviders.id }).from(schema.cmsProviders),
    ]);
    return `${bookings.length}/${services.length}/${providers.length}`;
  };

  // --- 0. the nine defaults, then the state of 17–19 Oct 2026 --------------------
  const offeringSchema = await import('@/db/cms-offering-schema');
  const rowsBefore = new Set(
    (await db.select({ id: cmsOfferings.id }).from(cmsOfferings)).map((row) => row.id),
  );
  const bootstrapped = await ensureDefaultOfferings({
    db,
    orm,
    schema: { cmsServices: schema.cmsServices, DEFAULT_LOCALE: locale },
    offerings: offeringSchema,
    log: () => {},
  });
  check('fixture: the nine default offerings are bootstrapped', bootstrapped.created.length === 9);
  for (const change of OFFERING_PRICE_CHANGES) {
    const row = await offeringRow(change.slug);
    if (!row) throw new Error(`self-test 18: offering ${change.slug} is missing`);
    await db
      .update(cmsOfferings)
      .set({
        duration: change.from.duration,
        contents: change.from.contents,
        extras: change.from.extras,
        metaDescription: change.from.metaDescription,
        variantMode: change.from.variantMode,
      })
      .where(eq(cmsOfferings.id, row.id));
    const kept = await db
      .select()
      .from(cmsOfferingVariants)
      .where(eq(cmsOfferingVariants.offeringId, row.id));
    await db.delete(cmsOfferingVariants).where(eq(cmsOfferingVariants.offeringId, row.id));
    for (const variant of change.from.variants) {
      const previous = kept.find((entry) => entry.audience === variant.audience);
      await db.insert(cmsOfferingVariants).values({
        offeringId: row.id,
        audience: variant.audience,
        serviceId: previous?.serviceId ?? null,
        priceCents: variant.priceCents,
      });
    }
  }
  for (const slug of NEW_OFFERING_SLUGS) {
    const row = await offeringRow(slug);
    if (row) await db.delete(cmsOfferings).where(eq(cmsOfferings.id, row.id));
  }
  for (const change of SERVICE_PRICE_CHANGES) {
    await db
      .update(schema.cmsServices)
      .set({
        durationMinutes: change.from.durationMinutes,
        priceCents: change.from.priceCents,
        showPrice: change.from.showPrice,
      })
      .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, change.slug)));
  }
  const before = await counts();
  check(
    'fixture: the 17 Oct state is back (no priced variant, 90/60 min, no new offerings)',
    (await serviceRow('volwassenenfit'))?.durationMinutes === 90 &&
      (await offeringRow('bikefit-tweede-bezoek')) === null,
  );

  // --- 1. dry run ---------------------------------------------------------------
  await run({ apply: false, restore: null });
  check(
    'dry run: plans every offering and service, blocks nothing, writes nothing',
    lines.some((line) => line.includes('offering bikefit-huidige-fiets — ')) &&
      lines.some((line) => line.includes('offering bikefit-tweede-bezoek — create')) &&
      lines.some((line) => line.includes('service jeugdfit — ')) &&
      !lines.some((line) => line.startsWith('!')) &&
      lines.some((line) => line.includes('run again with --apply')) &&
      (await serviceRow('volwassenenfit'))?.durationMinutes === 90,
    lines.join('\n'),
  );

  // --- 2. apply -----------------------------------------------------------------
  await run({ apply: true, restore: null });
  const adult = await serviceRow('volwassenenfit');
  const youth = await serviceRow('jeugdfit');
  const secondVisit = await offeringRow('bikefit-tweede-bezoek');
  const secondBike = await offeringRow('bikefit-tweede-fiets');
  const backupLine = lines.find((line) => line.includes('backup written: '));
  check(
    'apply: services 2 u and priced, the two new offerings exist, counts unchanged, backup written',
    adult?.durationMinutes === 120 &&
      adult.priceCents === 27500 &&
      adult.showPrice === true &&
      youth?.durationMinutes === 120 &&
      youth.priceCents === 15000 &&
      youth.showPrice === true &&
      secondVisit !== null &&
      secondBike !== null &&
      (await counts()) === before &&
      Boolean(backupLine) &&
      lines.some((line) => line.includes('apply complete')),
    lines.join('\n'),
  );
  const audits = await db
    .select({ action: schema.cmsAuditLog.action })
    .from(schema.cmsAuditLog)
    .where(eq(schema.cmsAuditLog.action, 'patch.aanbod-prijzen.apply'));
  check('apply: audited once as patch.aanbod-prijzen.apply', audits.length === 1);

  // --- 3. the public catalogue --------------------------------------------------
  const catalogue = await loadOfferCatalogue(locale);
  const huidige = catalogue.bySlug['bikefit-huidige-fiets'];
  const nieuwe = catalogue.bySlug['bikefit-nieuwe-fiets'];
  const voet = catalogue.bySlug['voetanalyse'];
  // The 20 Oct patch writes the pair Volwassene + Jeugd, the two variants of the fits.
  const pair = `Volwassene ${formatPrice(27500)} · Jeugd – eenmalig ${formatPrice(15000)}`;
  check(
    'catalogue: the fit shows € 275 / € 150 and 2 u, the new-bike fit per audience, the foot analysis € 85 and 30 min',
    huidige?.offer.priceLabel === pair &&
      huidige.offer.durationLabel === 'Volwassene: 2 uur · Jeugd – eenmalig: 2 uur' &&
      nieuwe?.offer.priceLabel === pair &&
      nieuwe.offer.durationLabel === '2 uur' &&
      voet?.offer.priceLabel === formatPrice(8500) &&
      voet.offer.durationLabel === '30 minuten' &&
      Boolean(catalogue.bySlug['bikefit-tweede-fiets']),
    JSON.stringify({ huidige, nieuwe, voet }),
  );

  // --- 4. idempotent, restore, apply again --------------------------------------
  await run({ apply: true, restore: null });
  check(
    'second apply: nothing to do',
    lines.some((line) => line.includes('nothing to do')),
    lines.join('\n'),
  );
  const backupPath = backupLine!.slice(backupLine!.indexOf('backup written: ') + 16).trim();
  await run({ apply: false, restore: backupPath });
  check(
    'restore: 90/60 min, no price, the new offerings removed',
    (await serviceRow('volwassenenfit'))?.durationMinutes === 90 &&
      (await serviceRow('jeugdfit'))?.showPrice === false &&
      (await offeringRow('bikefit-tweede-bezoek')) === null &&
      (await offeringRow('bikefit-tweede-fiets')) === null &&
      (await counts()) === before,
    lines.join('\n'),
  );
  await run({ apply: true, restore: null });
  check(
    'apply after restore: the 20 Oct values are back for the sections that follow',
    (await serviceRow('volwassenenfit'))?.durationMinutes === 120 &&
      (await offeringRow('bikefit-tweede-bezoek')) !== null,
    lines.join('\n'),
  );

  // --- 5. an admin's edit blocks the patch --------------------------------------
  const foot = await offeringRow('voetanalyse');
  await db
    .update(cmsOfferings)
    .set({ duration: '45 minuten' })
    .where(eq(cmsOfferings.id, foot!.id));
  await run({ apply: false, restore: null });
  check(
    'conflict: a duration an admin changed is reported with ! and blocks the dry run',
    lines.some((line) => line.startsWith('!') && line.includes('voetanalyse')) &&
      lines.some((line) => line.includes('blocked')),
    lines.join('\n'),
  );
  let refused = false;
  try {
    await run({ apply: true, restore: null });
  } catch (error) {
    refused = error instanceof Error && error.message.includes('patch refused');
  }
  check('conflict: apply refuses', refused);
  await db
    .update(cmsOfferings)
    .set({ duration: '30 minuten' })
    .where(eq(cmsOfferings.id, foot!.id));
  await run({ apply: false, restore: null });
  check(
    'conflict cleared: nothing to do again',
    lines.some((line) => line.includes('nothing to do')),
    lines.join('\n'),
  );

  // --- 6. clean-up --------------------------------------------------------------
  await db
    .delete(cmsOfferings)
    .where(rowsBefore.size ? orm.notInArray(cmsOfferings.id, [...rowsBefore]) : orm.sql`true`);
  for (const service of DEFAULT_SERVICES) {
    await db
      .update(schema.cmsServices)
      .set({ name: service.name, description: service.description })
      .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, service.slug)));
  }
  check(
    'clean-up: the offerings are gone again, the two services keep their bootstrap name',
    (await db.select({ id: cmsOfferings.id }).from(cmsOfferings)).length === rowsBefore.size &&
      (await serviceRow('volwassenenfit'))?.name === 'Volwassenenfit' &&
      (await counts()) === before,
  );
}
