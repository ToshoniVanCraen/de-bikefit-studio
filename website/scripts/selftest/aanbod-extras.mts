/**
 * Self-test section 17c: extra's (add-ons) on the throwaway PGlite of
 * `cms-selftest.mts`, after the prices section (17b) removed the nine
 * offerings again:
 * 0. migration 0015: guarded statements only, re-running it is a no-op;
 * 1. the bootstrap offerings carry the extras: the four extras timed and
 *    priced under the fit's services, tweede fiets an extra only that names
 *    both bikefits as its hosts;
 * 2. availability with an extra holds the service plus its minutes; an id
 *    that is no extra of the service is refused;
 * 3. a booking with an extra: ends later, keeps a snapshot row, names the
 *    extra in its summary, the confirmation mail and the admin list; an
 *    unknown extra is refused before anything is written;
 * 4. `cms:patch-aanbod-extras` on a database as migration 0015 leaves it:
 *    the dry run writes nothing; apply writes the columns and links, audits,
 *    a second dry run finds nothing; restore puts the bare state back; an
 *    offering changed in Beheer blocks the patch; apply again;
 * 5. clean-up, so later sections find the database as before.
 *
 * Imported lazily by `cms-selftest.mts` after its request-context stubs.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as orm from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsBookingAddons, cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { addDaysYmd, BOOKING_TIMEZONE, todayYmd } from '@/lib/booking/time';
import { runAanbodExtrasPatch } from '../lib/aanbod-extras-patch.mjs';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
import { ensureDefaultOfferings } from '../lib/offerings-bootstrap.mjs';

type Check = (label: string, condition: boolean, detail?: string) => void;

const { and, eq, inArray, sql } = orm;

function minutesBetween(startsAt: string, endsAt: string): number {
  return Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
}

export async function aanbodExtrasSection(ctx: {
  db: CmsDatabase;
  check: Check;
  section: (title: string) => void;
  cookieJar: Map<string, string>;
  backupDir: string;
  admin: { id: string };
}) {
  const { db, check, section, cookieJar, backupDir, admin } = ctx;
  section("17c. aanbod extra's: catalogue, booking, patch (20 Oct 2026)");

  const schema = await import('@/db/cms-schema');
  const offeringSchema = await import('@/db/cms-offering-schema');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const { availabilityAction } = await import('@/lib/booking/public-actions');
  const { createPublicBooking } = await import('@/lib/booking/public-booking');
  const { emailData, loadBookingContext } = await import('@/lib/booking/notifications');
  const { bookingConfirmationEmail } = await import('@/lib/email/templates');
  const bookingRepo = await import('@/lib/booking/repo');
  const locale = schema.DEFAULT_LOCALE;
  const slugs = DEFAULT_OFFERS.map((entry) => entry.content.slug);

  const lines: string[] = [];
  const log = (symbol: string, message: string) => {
    lines.push(`${symbol} ${message}`);
  };
  const run = (options: { apply: boolean; restore: string | null }) => {
    lines.length = 0;
    return runAanbodExtrasPatch(
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
  const linkSlugs = async (slug: string) => {
    const host = await offeringRow(slug);
    if (!host) return [];
    const links = await db
      .select({ addonId: cmsOfferingAddons.addonId, sortOrder: cmsOfferingAddons.sortOrder })
      .from(cmsOfferingAddons)
      .where(eq(cmsOfferingAddons.offeringId, host.id))
      .orderBy(orm.asc(cmsOfferingAddons.sortOrder));
    const rows = await db
      .select({ id: cmsOfferings.id, slug: cmsOfferings.slug })
      .from(cmsOfferings);
    return links.map((link) => rows.find((row) => row.id === link.addonId)?.slug ?? '?');
  };
  const auditCount = async (action?: string) =>
    (
      await db
        .select({ id: schema.cmsAuditLog.id })
        .from(schema.cmsAuditLog)
        .where(action ? eq(schema.cmsAuditLog.action, action) : undefined)
    ).length;

  // --- 0: migration 0015 ------------------------------------------------------
  const migrationSql = await readFile(
    resolve(process.cwd(), 'drizzle', '0015_cms_offering_addons.sql'),
    'utf8',
  );
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.replace(/^--.*$/gm, '').trim())
    .filter(Boolean);
  check(
    'migration 0015: every statement guarded; no INSERT/UPDATE/DELETE/DROP TABLE',
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
  check('migration 0015: re-running it is a no-op', rerun === 'ok', rerun);

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
  const voet = await offeringRow('voetanalyse');
  const tweede = await offeringRow('bikefit-tweede-fiets');
  check(
    'bootstrap: the nine offerings with their extra columns and the links of both bikefits',
    seeded.created.length === 9 &&
      voet?.isAddon === true &&
      voet.soldAlone === true &&
      voet.addonMinutes === 30 &&
      tweede?.isAddon === true &&
      tweede.soldAlone === false &&
      tweede.addonMinutes === 30 &&
      (await linkSlugs('bikefit-huidige-fiets')).join(',') ===
        'bikefit-tweede-fiets,voetanalyse,zadelanalyse,afstellen-schoenplaatjes' &&
      (await linkSlugs('bikefit-nieuwe-fiets')).length === 4 &&
      (await linkSlugs('voetanalyse')).length === 0,
    JSON.stringify({ created: seeded.created.length, voet, tweede }),
  );
  const catalogue = await loadOfferCatalogue(locale);
  const options = adultFit ? (catalogue.addonsByService[adultFit.id] ?? []) : [];
  check(
    'catalogue: the fit offers the four extras in order, timed and priced',
    options.map((option) => `${option.slug}:${option.minutes}:${option.priceCents}`).join('|') ===
      'bikefit-tweede-fiets:30:7500|voetanalyse:30:8500|zadelanalyse:60:6000|afstellen-schoenplaatjes:15:1500',
    options.map((option) => option.slug).join(','),
  );
  const tweedeLive = catalogue.bySlug['bikefit-tweede-fiets'];
  check(
    'catalogue: tweede fiets is an extra only — listed, status addon, no booking service, hosted by both bikefits',
    tweedeLive?.offering.status === 'addon' &&
      catalogue.offers.some((offer) => offer.slug === 'bikefit-tweede-fiets') &&
      tweedeLive.offer.bookingServiceSlugs.length === 0 &&
      tweedeLive.addonHosts.map((host) => host.slug).join(',') ===
        'bikefit-nieuwe-fiets,bikefit-huidige-fiets' &&
      catalogue.bySlug['voetanalyse']?.offering.status === 'enquiry',
    JSON.stringify({ status: tweedeLive?.offering.status, hosts: tweedeLive?.addonHosts }),
  );

  // --- 2: availability with an extra -------------------------------------------------
  const today = todayYmd(new Date(), BOOKING_TIMEZONE);
  const window = { fromYmd: addDaysYmd(today, 3), toYmd: addDaysYmd(today, 17) };
  const voetOption = options.find((option) => option.slug === 'voetanalyse');
  const plain = adultFit
    ? await availabilityAction({ serviceId: adultFit.id, providerId: null, ...window })
    : null;
  const longer =
    adultFit && voetOption
      ? await availabilityAction({
          serviceId: adultFit.id,
          providerId: null,
          ...window,
          addonIds: [voetOption.offeringId],
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
  const notAnExtra = adultFit
    ? await availabilityAction({
        serviceId: adultFit.id,
        providerId: null,
        ...window,
        addonIds: [catalogue.bySlug['lactaattest']?.offer.id ?? 'x'],
      })
    : null;
  check(
    'availability: an offering that is no extra of the service is refused',
    notAnExtra?.ok === false && notAnExtra.message.includes('extra'),
    JSON.stringify(notAnExtra),
  );

  // --- 3: a booking with an extra ----------------------------------------------------
  const slot = longer?.ok ? longer.slots[0] : null;
  const booked =
    adultFit && slot && voetOption
      ? await createPublicBooking(
          {
            serviceId: adultFit.id,
            providerId: null,
            locationId: slot.locationId,
            startsAt: slot.startsAt,
            addonIds: [voetOption.offeringId],
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
    'booking: made with the extra — ends 2 u 30 after the start, one snapshot row, the summary names it',
    booked?.ok === true &&
      minutesBetween(booked.booking.startsAt, booked.booking.endsAt) === 150 &&
      booked.booking.addons.length === 1 &&
      booked.booking.addons[0].title === 'Voetanalyse' &&
      booked.booking.addons[0].minutes === 30 &&
      addonRows.length === 1 &&
      addonRows[0].priceCents === 8500 &&
      addonRows[0].slug === 'voetanalyse',
    booked?.ok ? JSON.stringify(booked.booking.addons) : JSON.stringify(booked),
  );
  if (booked?.ok) {
    const context = await loadBookingContext(booked.bookingId);
    const mail = context ? bookingConfirmationEmail(await emailData(context)) : null;
    check(
      'mail: the confirmation lists the extra and the full duration',
      mail !== null &&
        mail.text.includes('Voetanalyse (30 min)') &&
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
      listed?.addons.length === 1 && listed.addons[0].title === 'Voetanalyse',
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

  // --- 4: the patch on a database as migration 0015 leaves it ----------------------
  await db
    .update(cmsOfferings)
    .set({ isAddon: false, soldAlone: true, addonMinutes: null })
    .where(eq(cmsOfferings.locale, locale));
  await db.delete(cmsOfferingAddons);
  const auditBefore = await auditCount();
  await run({ apply: false, restore: null });
  check(
    'dry run: six offerings to update, nothing written, no audit entry',
    lines.filter((line) => line.startsWith('~ offering')).length === 6 &&
      lines.at(-1)?.includes('run again with --apply') === true &&
      (await offeringRow('voetanalyse'))?.isAddon === false &&
      (await linkSlugs('bikefit-huidige-fiets')).length === 0 &&
      (await auditCount()) === auditBefore,
    lines.filter((line) => /^[~!→=]/.test(line)).join(' | '),
  );
  await run({ apply: true, restore: null });
  const applyLines = [...lines];
  const backupPath = applyLines
    .find((line) => line.startsWith('✓ backup written: '))
    ?.slice('✓ backup written: '.length);
  const voetAfter = await offeringRow('voetanalyse');
  const tweedeAfter = await offeringRow('bikefit-tweede-fiets');
  check(
    'apply: columns and links written, audited, backup written',
    applyLines.some((line) => line.startsWith('✓ apply complete')) &&
      Boolean(backupPath) &&
      voetAfter?.isAddon === true &&
      voetAfter.addonMinutes === 30 &&
      tweedeAfter?.soldAlone === false &&
      (await linkSlugs('bikefit-huidige-fiets')).join(',') ===
        'bikefit-tweede-fiets,voetanalyse,zadelanalyse,afstellen-schoenplaatjes' &&
      (await linkSlugs('bikefit-nieuwe-fiets')).length === 4 &&
      (await auditCount('patch.aanbod-extras.apply')) === 1,
    applyLines.filter((line) => /^[~!✓]/.test(line)).join(' | '),
  );
  await run({ apply: false, restore: null });
  check(
    'dry run after apply: nothing to do',
    lines.at(-1)?.includes('nothing to do') === true,
    lines.at(-1),
  );
  if (backupPath) {
    await run({ apply: false, restore: backupPath });
    check(
      'restore: the bare state of migration 0015 is back',
      (await offeringRow('voetanalyse'))?.isAddon === false &&
        (await offeringRow('bikefit-tweede-fiets'))?.soldAlone === true &&
        (await linkSlugs('bikefit-huidige-fiets')).length === 0,
      lines.join(' | '),
    );
  }
  // An offering changed in Beheer since the migration blocks the patch.
  await db
    .update(cmsOfferings)
    .set({ isAddon: true, addonMinutes: 45 })
    .where(and(eq(cmsOfferings.locale, locale), eq(cmsOfferings.slug, 'voetanalyse')));
  await run({ apply: false, restore: null });
  let refused = false;
  try {
    await run({ apply: true, restore: null });
  } catch {
    refused = true;
  }
  check(
    'guard: an offering changed in Beheer blocks the dry run (!) and the apply, nothing written',
    refused &&
      (await linkSlugs('bikefit-huidige-fiets')).length === 0 &&
      (await auditCount('patch.aanbod-extras.apply')) === 1,
    lines.filter((line) => line.startsWith('!')).join(' | '),
  );
  await db
    .update(cmsOfferings)
    .set({ isAddon: false, addonMinutes: null })
    .where(and(eq(cmsOfferings.locale, locale), eq(cmsOfferings.slug, 'voetanalyse')));
  await run({ apply: true, restore: null });
  check(
    'apply again: the extras are back',
    (await linkSlugs('bikefit-huidige-fiets')).length === 4 &&
      (await offeringRow('voetanalyse'))?.addonMinutes === 30,
    lines.filter((line) => /^[~!✓]/.test(line)).join(' | '),
  );

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
