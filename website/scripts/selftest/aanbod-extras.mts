/**
 * Self-test section 17c: extra's (add-ons) on the throwaway PGlite of
 * `cms-selftest.mts`, after the prices section (17b) removed the nine
 * offerings again. Toshoni, 27 Oct 2026: *Bikefit – tweede fiets* is the only
 * extra of a bikefit (two choices); voetanalyse, zadelanalyse and
 * afstellen-schoenplaatjes are included in every bikefit, so no extra.
 * 0. migrations 0015 and 0016: guarded statements only, re-running them is a
 *    no-op;
 * 1. the bootstrap offerings carry the extras: the fit offers the two choices
 *    of tweede fiets, timed and priced, and nothing else; tweede fiets is an
 *    extra only that names both bikefits as its hosts; the three analyses are
 *    sold alone and no extra;
 * 2. availability with an extra holds the service plus its minutes; an id
 *    that is no extra of the service (lactaattest, voetanalyse) is refused;
 * 3. a booking with an extra: ends later, keeps a snapshot row, names the
 *    extra in its summary, the confirmation mail and the admin list; an
 *    unknown extra is refused before anything is written;
 * 4. `cms:patch-aanbod-extras` (`aanbod-extras-scenarios.mts`: a fresh
 *    database, an edit in Beheer, the state of 20 Oct 2026 that staging and
 *    production hold now);
 * 5. clean-up, so later sections find the database as before.
 *
 * Imported lazily by `cms-selftest.mts` after its request-context stubs.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as orm from 'drizzle-orm';
import { cmsBookingAddons, cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { addDaysYmd, BOOKING_TIMEZONE, todayYmd } from '@/lib/booking/time';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
import { ensureDefaultOfferings } from '../lib/offerings-bootstrap.mjs';
import { createExtrasKit, type ExtrasSectionContext } from './aanbod-extras-kit.mjs';
import { aanbodExtrasPatchSection } from './aanbod-extras-scenarios.mjs';

const { and, eq, inArray, sql } = orm;

/** Sold alone and included in every bikefit: never an extra of one. */
const ANALYSIS_SLUGS = ['voetanalyse', 'zadelanalyse', 'afstellen-schoenplaatjes'];

function minutesBetween(startsAt: string, endsAt: string): number {
  return Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
}

export async function aanbodExtrasSection(ctx: ExtrasSectionContext) {
  const { db, check, section, cookieJar, admin } = ctx;
  section("17c. aanbod extra's: catalogue, booking, patch (20 + 27 Oct 2026)");

  const schema = await import('@/db/cms-schema');
  const offeringSchema = await import('@/db/cms-offering-schema');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const { availabilityAction } = await import('@/lib/booking/public-actions');
  const { createPublicBooking } = await import('@/lib/booking/public-booking');
  const { emailData, loadBookingContext } = await import('@/lib/booking/notifications');
  const { bookingConfirmationEmail } = await import('@/lib/email/templates');
  const bookingRepo = await import('@/lib/booking/repo');
  const { locale, offeringRow, linkSlugs } = await createExtrasKit(ctx);
  const slugs = DEFAULT_OFFERS.map((entry) => entry.content.slug);

  // --- 0: migrations 0015 + 0016 ---------------------------------------------------
  for (const file of ['0015_cms_offering_addons.sql', '0016_cms_offering_addon_options.sql']) {
    const migrationSql = await readFile(resolve(process.cwd(), 'drizzle', file), 'utf8');
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((statement) => statement.replace(/^--.*$/gm, '').trim())
      .filter(Boolean);
    check(
      `migration ${file.slice(0, 4)}: every statement guarded; no INSERT/UPDATE/DELETE/DROP TABLE`,
      statements.every(
        (statement) =>
          /^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS/.test(statement) ||
          /^ALTER TABLE "cms_offerings" ADD COLUMN IF NOT EXISTS/.test(statement) ||
          /^DO \$\$ BEGIN\s+ALTER TABLE "cms_(booking|offering)_addons" ADD CONSTRAINT[\s\S]*duplicate_object/.test(
            statement,
          ),
      ) &&
        !/\b(INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|DROP\s+TABLE|TRUNCATE)\b/i.test(
          statements.join('\n'),
        ),
      `${statements.length} statements`,
    );
    let rerun = 'ok';
    try {
      for (const statement of statements) await db.execute(sql.raw(statement));
    } catch (error) {
      rerun = error instanceof Error ? error.message : String(error);
    }
    check(`migration ${file.slice(0, 4)}: re-running it is a no-op`, rerun === 'ok', rerun);
  }

  // --- 1: the bootstrap offerings carry the extras ---------------------------------
  const seeded = await ensureDefaultOfferings({
    db,
    orm,
    schema: { cmsServices: schema.cmsServices, DEFAULT_LOCALE: locale },
    offerings: offeringSchema,
    log: () => {},
  });
  const [adultFit] = await db
    .select()
    .from(schema.cmsServices)
    .where(
      and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, 'volwassenenfit')),
    )
    .limit(1);
  const [youthFit] = await db
    .select()
    .from(schema.cmsServices)
    .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, 'jeugdfit')))
    .limit(1);
  const analyses = await Promise.all(ANALYSIS_SLUGS.map((slug) => offeringRow(slug)));
  const tweede = await offeringRow('bikefit-tweede-fiets');
  check(
    'bootstrap: the nine offerings; tweede fiets the only extra (an extra only, two choices), both bikefits link to it alone, the three analyses are no extra',
    seeded.created.length === 9 &&
      analyses.every(
        (row) =>
          row?.isAddon === false &&
          row.soldAlone === true &&
          row.addonMinutes === null &&
          row.addonOptions.length === 0,
      ) &&
      tweede?.isAddon === true &&
      tweede.soldAlone === false &&
      tweede.addonMinutes === 30 &&
      tweede.addonOptions.length === 2 &&
      tweede.addonOptions[1]?.key === 'ander-type' &&
      (await linkSlugs('bikefit-huidige-fiets')).join(',') === 'bikefit-tweede-fiets' &&
      (await linkSlugs('bikefit-nieuwe-fiets')).join(',') === 'bikefit-tweede-fiets' &&
      (await Promise.all(ANALYSIS_SLUGS.map((slug) => linkSlugs(slug)))).every(
        (links) => links.length === 0,
      ),
    JSON.stringify({ created: seeded.created.length, analyses, tweede }),
  );
  const catalogue = await loadOfferCatalogue(locale);
  const options = adultFit ? (catalogue.addonsByService[adultFit.id] ?? []) : [];
  check(
    'catalogue: the fit offers the two choices of tweede fiets, timed and priced, and nothing else — also for Jeugd',
    options
      .map((option) => `${option.slug}:${option.optionKey}:${option.minutes}:${option.priceCents}`)
      .join('|') ===
      'bikefit-tweede-fiets:zelfde-type:30:7500|bikefit-tweede-fiets:ander-type:60:15000' &&
      options[0].id === `${options[0].offeringId}#zelfde-type` &&
      options[1].label === 'Ander type fiets' &&
      (youthFit ? (catalogue.addonsByService[youthFit.id] ?? []) : []).length === 2,
    options.map((option) => option.slug).join(','),
  );
  const tweedeLive = catalogue.bySlug['bikefit-tweede-fiets'];
  check(
    'catalogue: tweede fiets is an extra only — listed, status addon, no booking service, hosted by both bikefits',
    tweedeLive?.offering.status === 'addon' &&
      catalogue.offers.some((offer) => offer.slug === 'bikefit-tweede-fiets') &&
      tweedeLive.offer.bookingServiceSlugs.length === 0 &&
      tweedeLive.addonHosts.map((host) => host.slug).join(',') ===
        'bikefit-nieuwe-fiets,bikefit-huidige-fiets',
    JSON.stringify({ status: tweedeLive?.offering.status, hosts: tweedeLive?.addonHosts }),
  );
  check(
    'catalogue: the three analyses are listed, asked for, no extra and offered as one by no bikefit',
    ANALYSIS_SLUGS.every((slug) => {
      const entry = catalogue.bySlug[slug];
      return (
        entry?.offering.status === 'enquiry' &&
        entry.offering.isAddon === false &&
        entry.addonHosts.length === 0 &&
        catalogue.offers.some((offer) => offer.slug === slug)
      );
    }),
    ANALYSIS_SLUGS.map((slug) => catalogue.bySlug[slug]?.offering.status).join(','),
  );

  // --- 2: availability with an extra -------------------------------------------------
  const today = todayYmd(new Date(), BOOKING_TIMEZONE);
  const window = { fromYmd: addDaysYmd(today, 3), toYmd: addDaysYmd(today, 17) };
  const sameTypeOption = options.find((option) => option.optionKey === 'zelfde-type');
  const plain = adultFit
    ? await availabilityAction({ serviceId: adultFit.id, providerId: null, ...window })
    : null;
  const longer =
    adultFit && sameTypeOption
      ? await availabilityAction({
          serviceId: adultFit.id,
          providerId: null,
          ...window,
          addonIds: [sameTypeOption.id],
        })
      : null;
  check(
    'availability: with an extra every slot holds the service plus its minutes, and there are no more of them',
    plain?.ok === true &&
      longer?.ok === true &&
      plain.slots.length > 0 &&
      longer.slots.length > 0 &&
      longer.slots.length <= plain.slots.length &&
      longer.slots.every(
        (slot) => minutesBetween(slot.startsAt, slot.endsAt) === adultFit!.durationMinutes + 30,
      ) &&
      plain.slots.every(
        (slot) => minutesBetween(slot.startsAt, slot.endsAt) === adultFit!.durationMinutes,
      ),
    JSON.stringify({
      plain: plain?.ok ? plain.slots.length : plain?.message,
      longer: longer?.ok ? longer.slots.length : longer?.message,
    }),
  );
  // Lactaattest was never an extra; voetanalyse was one until 27 Oct 2026 (a bikefit includes it).
  const withOffering = async (slug: string) =>
    adultFit
      ? availabilityAction({
          serviceId: adultFit.id,
          providerId: null,
          ...window,
          addonIds: [catalogue.bySlug[slug]?.offer.id ?? 'x'],
        })
      : null;
  const notExtras = [await withOffering('lactaattest'), await withOffering('voetanalyse')];
  check(
    'availability: an offering that is no extra of the service — lactaattest, and voetanalyse which a bikefit includes — is refused',
    notExtras.every((result) => result?.ok === false && result.message.includes('extra')),
    JSON.stringify(notExtras),
  );
  const tweedeChoices = options.filter((option) => option.slug === 'bikefit-tweede-fiets');
  const twice =
    adultFit && tweedeChoices.length === 2
      ? await availabilityAction({
          serviceId: adultFit.id,
          providerId: null,
          ...window,
          addonIds: tweedeChoices.map((option) => option.id),
        })
      : null;
  check(
    'availability: two choices of the same extra are refused',
    twice?.ok === false,
    JSON.stringify(twice),
  );

  // --- 3: a booking with an extra ----------------------------------------------------
  const slot = longer?.ok ? longer.slots[0] : null;
  const booked =
    adultFit && slot && sameTypeOption
      ? await createPublicBooking(
          {
            serviceId: adultFit.id,
            providerId: null,
            locationId: slot.locationId,
            startsAt: slot.startsAt,
            addonIds: [sameTypeOption.id],
            customerName: 'Extra Tester',
            customerEmail: 'extra-tester@example.com',
            customerPhone: '0470 00 00 00',
          },
          { ipAddress: '203.0.113.90' },
        )
      : null;
  const addonRows = booked?.ok
    ? await db
        .select()
        .from(cmsBookingAddons)
        .where(eq(cmsBookingAddons.bookingId, booked.bookingId))
    : [];
  check(
    'booking: made with a choice of tweede fiets — ends 2 u 30 after the start, one snapshot row, the summary names it',
    booked?.ok === true &&
      minutesBetween(booked.booking.startsAt, booked.booking.endsAt) === 150 &&
      booked.booking.addons.length === 1 &&
      booked.booking.addons[0].title === 'Bikefit – tweede fiets – Zelfde type fiets' &&
      booked.booking.addons[0].minutes === 30 &&
      addonRows.length === 1 &&
      addonRows[0].priceCents === 7500 &&
      addonRows[0].slug === 'bikefit-tweede-fiets',
    booked?.ok ? JSON.stringify(booked.booking.addons) : JSON.stringify(booked),
  );
  if (booked?.ok) {
    const context = await loadBookingContext(booked.bookingId);
    const mail = context ? bookingConfirmationEmail(await emailData(context)) : null;
    check(
      'mail: the confirmation lists the extra and the full duration',
      mail !== null &&
        mail.text.includes('Bikefit – tweede fiets – Zelfde type fiets (30 min)') &&
        mail.text.includes('(2 u 30 min)') &&
        mail.html.includes('Extra’s'),
      mail ? mail.text.split('\n').slice(0, 8).join(' | ') : 'no context',
    );
    const listed = await withAdminSession({ db, cookieJar }, admin.id, 'cms-selftest', async () =>
      (await bookingRepo.listBookings({ range: 'all', limit: 1000 })).find(
        (item) => item.id === booked.bookingId,
      ),
    );
    check(
      'admin: the bookings list carries the extra',
      listed?.addons.length === 1 &&
        listed.addons[0].title === 'Bikefit – tweede fiets – Zelfde type fiets',
      JSON.stringify(listed?.addons),
    );
  }
  const bogus =
    adultFit && slot
      ? await createPublicBooking(
          {
            serviceId: adultFit.id,
            providerId: null,
            startsAt: slot.startsAt,
            addonIds: ['geen-extra'],
            customerName: 'Extra Tester',
            customerEmail: 'extra-tester-2@example.com',
            customerPhone: '0470 00 00 01',
          },
          { ipAddress: '203.0.113.91' },
        )
      : null;
  check(
    'booking: an unknown extra is refused as invalid, with a field error',
    bogus?.ok === false && bogus.code === 'invalid' && Boolean(bogus.fieldErrors.addonIds),
    JSON.stringify(bogus),
  );
  if (booked?.ok) {
    await db.delete(schema.cmsBookings).where(eq(schema.cmsBookings.id, booked.bookingId));
    const left = await db
      .select()
      .from(cmsBookingAddons)
      .where(eq(cmsBookingAddons.bookingId, booked.bookingId));
    check('booking: deleting the booking cascades its extras', left.length === 0);
  }

  // --- 4: the patch (a fresh database, an edit in Beheer, the state of 20 Oct 2026) ---
  await aanbodExtrasPatchSection(ctx);

  // --- 5: clean-up ----------------------------------------------------------------------
  await db
    .delete(cmsOfferings)
    .where(and(eq(cmsOfferings.locale, locale), inArray(cmsOfferings.slug, slugs)));
  check(
    'clean-up: the nine offerings and their links are gone again',
    (await db.select({ id: cmsOfferings.id }).from(cmsOfferings)).length === 0 &&
      (await db.select({ id: cmsOfferingAddons.offeringId }).from(cmsOfferingAddons)).length === 0,
  );
}
