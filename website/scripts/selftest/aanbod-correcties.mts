/**
 * Self-test section 17d: `cms:patch-aanbod-correcties` (Toshoni's corrections of
 * 27 Oct 2026) on the throwaway PGlite of `cms-selftest.mts`, after the extras
 * section (17c). The database is put in the state staging and production hold
 * (`aanbod-correcties-fixture.mts`), the patch is driven through the entry
 * point of the CLI (`run()` of the kit), and the database is given back as it
 * was found:
 *
 *  1. the dry run plans every section (`~`), writes nothing (no write call, no
 *     session, no audit entry) and blocks nothing;
 *  2. apply writes the backup first, then settings, location, the copy, the
 *     guardian rule (off on Jeugdfit) and durations of the services, the
 *     offerings' copy, Toshoni's offerings, the menu and the pages, and verifies
 *     on the public readers; no youth package is made (withdrawn 29 Oct 2026);
 *     what visitors get is checked here again;
 *  3. a second dry run finds nothing to do;
 *  4. restore returns exactly the state before (the fingerprint of every table
 *     the patch touches), apply once more reaches the same end state;
 *  5. what must block does: an edited offering text, a service left without a
 *     provider, an editor's unpublished draft, a service text of neither state, a
 *     database that holds the withdrawn youth package; a service text the repo
 *     left (20 Oct 2026) is accepted (`aanbod-correcties-guards.mts`);
 *  6. the state staging held on 27 Oct 2026: the first seed's meta description
 *     on `/afspraak` is accepted; "Toshoni Van Craen" (the login of
 *     `cms:seed-booking`) as the only provider of the fits blocks the dry run,
 *     and the apply refuses before any write; with a replacement provider it
 *     applies, verifies, finds nothing on a second run and restores
 *     (`aanbod-correcties-staging.mts`);
 *  7. production’s exact `/aanbod` editor subtitle is kept in draft and published snapshot;
 *     a third value blocks before a write (`aanbod-correcties-production-copy.mts`);
 *  8. staging with `--staging-retain-toshoni` (Toshoni, 27 Oct 2026, 15:12):
 *     him the only provider row, the dry run is clean, the apply keeps his
 *     offerings, idempotent, restores; a second provider makes the flag stop
 *     (`aanbod-correcties-retain.mts`);
 *  9. clean-up: every table is put back, and checked.
 *
 * Imported lazily by `cms-selftest.mts` after its request-context stubs.
 */
import * as orm from 'drizzle-orm';
import { cmsOfferings, cmsOfferingVariants } from '@/db/cms-offering-schema';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import {
  OFFERING_TEXT_CORRECTIONS,
  SERVICE_TEXT_CORRECTIONS,
} from '@/lib/offers/corrections-2026-10-27';
import {
  CORRECTION_PAGE_SPECS,
  PHONE_HREF_AFTER,
  PHONE_LABEL_AFTER,
  SETTING_TEXT_CORRECTIONS,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import { resolveCopyTokens } from '@/lib/studio/copy-tokens';
import { CONTACT_EMAIL, PHONE_TOKEN } from '@/lib/studio/seed-content/shared';
import { readCorrectiesBackup } from '../lib/aanbod-correcties-backup.mjs';
import { runAanbodCorrectiesPatch } from '../lib/aanbod-correcties-patch.mjs';
import { sameValue } from '../lib/aanbod-correcties-targets.mjs';
import { seedBefore } from './aanbod-correcties-fixture.mjs';
import { guardChecks } from './aanbod-correcties-guards.mjs';
import { retainChecks } from './aanbod-correcties-retain.mjs';
import { productionCopyChecks } from './aanbod-correcties-production-copy.mjs';
import { stagingChecks } from './aanbod-correcties-staging.mjs';
import {
  createCorrectiesKit,
  fingerprint,
  planLines,
  restoreState,
  snapshotState,
  type CorrectiesSectionContext,
} from './aanbod-correcties-kit.mjs';

const { eq } = orm;

export async function aanbodCorrectiesSection(ctx: CorrectiesSectionContext) {
  const { db, check, section, cookieJar } = ctx;
  section(
    '17d. aanbod correcties: settings, pages, copy, no guardian, no youth package, Toshoni (27 and 29 Oct 2026)',
  );

  const kit = await createCorrectiesKit(ctx);
  const { schema, locale, lines, run, backupPathOf, auditCount, serviceRow, pageRow } = kit;
  const { subscriptions, sessions } = kit;
  const { getNavigation, getPublishedPage, getSiteSettings } = await import('@/lib/cms/content');
  const { listPublicProviders } = await import('@/lib/booking/content');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const { getDefaultStudioLocation } = await import('@/lib/booking/location-store');
  const { loadCopyTokenLookup } = await import('@/lib/studio/copy-token-lookup');

  const original = await snapshotState(db, schema);
  const originalPrint = await fingerprint(db, schema);

  try {
    // --- the database before 27 Oct 2026 -------------------------------------------------------
    const fx = await seedBefore(kit, ctx);
    const before = await fingerprint(db, schema);
    const published = Object.keys(fx.pageIds).filter(
      (slug) => !['contact', 'over-ons'].includes(slug),
    );
    check(
      'fixture: the old address, phone number and SEO texts; no business/rules settings; the fits without a package variant, Jeugdfit asking for a guardian; Toshoni and Winston offer three services',
      (await getSiteSettings(locale)).contact.city === 'Ninove' &&
        (
          await db
            .select()
            .from(schema.cmsSiteSettings)
            .where(orm.inArray(schema.cmsSiteSettings.key, ['business', 'rules']))
        ).length === 0 &&
        (
          await db
            .select()
            .from(cmsOfferingVariants)
            .where(eq(cmsOfferingVariants.audience, 'youth-package'))
        ).length === 0 &&
        (await serviceRow('jeugdfit'))?.requiresGuardian === true &&
        (await subscriptions(fx.toshoniId)).length === 3 &&
        (await subscriptions(fx.winstonId)).length === 3 &&
        published.length >= 8,
      `${published.length} published pages`,
    );

    // --- 1: the dry run -------------------------------------------------------------------------
    const writeCalls: string[] = [];
    const watchedDb = new Proxy(db, {
      get(target, property, receiver) {
        const writes = ['insert', 'update', 'delete', 'execute', 'transaction', 'batch'];
        if (typeof property === 'string' && writes.includes(property)) writeCalls.push(property);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const sessionsBefore = await sessions();
    const auditBefore = await auditCount();
    const watched: string[] = [];
    await runAanbodCorrectiesPatch(
      { apply: false, restore: null, backupDir: ctx.backupDir, providerMode: 'remove' },
      {
        db: watchedDb,
        driver: 'pglite',
        cookieJar,
        log: (symbol, message) => watched.push(`${symbol} ${message}`),
      },
    );
    check(
      'dry run: no write call reaches the database; no session, no audit entry, no cookie, nothing changed',
      writeCalls.length === 0 &&
        (await sessions()) === sessionsBefore &&
        (await auditCount()) === auditBefore &&
        !cookieJar.has('cms_session') &&
        (await fingerprint(db, schema)) === before,
      writeCalls.join(),
    );
    await run({ apply: false, restore: null });
    const planned = [...lines];
    const has = (prefix: string, ...parts: string[]) =>
      planned.some((line) => line.startsWith(prefix) && parts.every((part) => line.includes(part)));
    check(
      'dry run: the settings — address and phone number, the SEO texts, the two new groups',
      has(
        '~ setting contact — address: Ninove → Halsesteenweg 406 a, 9403 Neigem; phone label: 0473 95 26 33 →',
        PHONE_LABEL_AFTER,
        'phone link: tel:0473952633 →',
        PHONE_HREF_AFTER,
      ) &&
        has('~ setting seo — defaultMetaTitle') &&
        has('~ setting business — new row with the schema defaults') &&
        has('~ setting rules — new row with the schema defaults') &&
        has('~ location ', 'Halsesteenweg 406 a, 9403 Neigem'),
      planLines(planned).slice(0, 6).join(' | '),
    );
    check(
      'dry run: no youth package anywhere; the service copy, the guardian rule off on Jeugdfit, the durations, Toshoni, the menu',
      !planLines(planned).some((line) =>
        /volledig pakket|-pakket|youth.package|^. variant /i.test(line),
      ) &&
        has('~ service volwassenenfit — ') &&
        has('~ service jeugdfit — name: ') &&
        has('~ service jeugdfit — requiresGuardian: true → false') &&
        has('~ duration voetanalyse — 60 → 30 min') &&
        has('= duration bikefit-nieuwe-fiets — no booking service (asked for): nothing to set') &&
        has(
          '~ provider Toshoni — 3 offering(s) removed: ',
          'volwassenenfit',
          'jeugdfit',
          'voetanalyse',
        ) &&
        has('→ provider list: cached for up to 5 minutes') &&
        has('~ menu main — insert "Cadeaubon" (/cadeaubon) before "Contact"'),
      planLines(planned).join(' | '),
    );
    check(
      'dry run: every page the specs name is planned and published; a retired draft with the old number is fixed as a draft; a retired page the repo would refuse is left alone; the guards line',
      CORRECTION_PAGE_SPECS.every((spec) =>
        has(`~ page ${spec.slug ? `/${spec.slug}` : '/'} — `, 'then publish'),
      ) &&
        has('~ page /afspraak — ', 'then publish') &&
        has('~ page /contact — ', 'draft only') &&
        has('= page /over-ons — not published, left alone') &&
        planned.some(
          (line) => line.startsWith('= guards: pages ') && line.includes('subscriptions 6'),
        ) &&
        planned.some((line) => line.startsWith('→ after the apply: blocks ')) &&
        !planned.some((line) => line.startsWith('!')) &&
        planned.at(-1)?.includes('run again with --apply') === true,
      planned.filter((line) => line.startsWith('~ page') || line.startsWith('= page')).join(' | '),
    );

    // --- 2: apply -------------------------------------------------------------------------------
    const applyAudits = await auditCount('patch.aanbod-correcties.apply');
    await run({ apply: true, restore: null });
    const backupPath = backupPathOf();
    const applied = [...lines];
    check(
      'apply: backup first, then the sections, verified on the public readers, row counts as planned',
      Boolean(backupPath) &&
        applied.findIndex((line) => line.startsWith('✓ backup written')) <
          applied.findIndex((line) => line.startsWith('~ ')) &&
        applied.some((line) =>
          line.startsWith('✓ settings, menu, offerings, services and published pages verified'),
        ) &&
        applied.some((line) => line.startsWith('✓ row counts as planned')) &&
        applied.some((line) => line === '✓ apply complete'),
      applied.filter((line) => /^[✓!]/.test(line)).join(' | '),
    );
    check(
      'apply: audited once as patch.aanbod-correcties.apply; the admin session is revoked and the cookie cleared',
      (await auditCount('patch.aanbod-correcties.apply')) === applyAudits + 1 &&
        (await sessions()) === sessionsBefore &&
        !cookieJar.has('cms_session'),
    );
    const afterApply = await fingerprint(db, schema);

    // What visitors and Beheer get.
    const settings = await getSiteSettings(locale);
    const settingRows = await db.select().from(schema.cmsSiteSettings);
    const stored = (key: string) => settingRows.find((row) => row.key === key)?.value;
    const schemaDefaults = defaultSiteSettings();
    check(
      'settings: the studio address and the international phone number; the SEO texts without dashes; business and rules written with the schema defaults; the e-mail address untouched',
      settings.contact.addressLines.join() === 'Halsesteenweg 406 a' &&
        settings.contact.postalCode === '9403' &&
        settings.contact.city === 'Neigem' &&
        settings.contact.phoneLabel === PHONE_LABEL_AFTER &&
        settings.contact.phoneHref === PHONE_HREF_AFTER &&
        settings.contact.email === CONTACT_EMAIL &&
        SETTING_TEXT_CORRECTIONS.every((entry) => settings.seo[entry.field] === entry.to) &&
        sameValue(stored('business'), schemaDefaults.business) &&
        sameValue(stored('rules'), schemaDefaults.rules),
      JSON.stringify(settings.contact),
    );
    const [studio] = await db
      .select()
      .from(schema.cmsLocations)
      .where(eq(schema.cmsLocations.id, fx.studioId));
    check(
      'location: the booking location has the street, postal code and city; its name is unchanged',
      studio.addressLines.join() === 'Halsesteenweg 406 a' &&
        studio.postalCode === '9403' &&
        studio.city === 'Neigem' &&
        studio.name.length > 0,
      `${studio.name}: ${studio.addressLines.join()} ${studio.postalCode} ${studio.city}`,
    );
    // The lookup the site builds per request reads the patched settings, location and catalogue.
    const lookup = await loadCopyTokenLookup(locale);
    const resolved = resolveCopyTokens(
      '{{adres}} | {{adres-studio}} | {{telefoon}} | {{telefoon-href}} | {{tweede-bezoek-gratis}} | {{prijs:bikefit-huidige-fiets:youth}}',
      lookup,
    ).replace(/\u00a0/g, ' ');
    const studioAddress = await getDefaultStudioLocation();
    check(
      'copy tokens: the address of both masters, the international phone number, the length of the free second visit and the youth price resolve from the patched database; the default studio location has the new address',
      resolved ===
        `Halsesteenweg 406 a, 9403 Neigem | Halsesteenweg 406 a, 9403 Neigem | ${PHONE_LABEL_AFTER} | ${PHONE_HREF_AFTER} | zes maanden | € 150` &&
        studioAddress?.addressLines.join() === 'Halsesteenweg 406 a' &&
        studioAddress.postalCode === '9403' &&
        studioAddress.city === 'Neigem',
      resolved,
    );
    const offerings = await db.select().from(cmsOfferings);
    check(
      'offerings: every corrected field holds the new text (all nine offerings), nothing else of them changed',
      OFFERING_TEXT_CORRECTIONS.every((correction) => {
        const row = offerings.find((entry) => entry.slug === correction.slug);
        return Object.entries(correction.to).every(([key, value]) =>
          sameValue((row as unknown as Record<string, unknown>)?.[key], value),
        );
      }),
    );

    const catalogue = await loadOfferCatalogue(locale);
    const labels = (slug: string) =>
      catalogue.bySlug[slug]?.offering.variants.map((v) => v.label).join(' / ');
    const youth = await serviceRow('jeugdfit');
    const packages = await db
      .select()
      .from(cmsOfferingVariants)
      .where(eq(cmsOfferingVariants.audience, 'youth-package'));
    const packageServices = (await db.select().from(schema.cmsServices)).filter((row) =>
      /pakket/.test(row.slug),
    );
    check(
      'no youth package: both fits show Volwassene / Jeugd – eenmalig, no package variant or service exists; Jeugdfit asks for no guardian; the current-bike fit books Jeugd through jeugdfit, the new-bike fit is asked for',
      labels('bikefit-huidige-fiets') === 'Volwassene / Jeugd – eenmalig' &&
        labels('bikefit-nieuwe-fiets') === 'Volwassene / Jeugd – eenmalig' &&
        packages.length === 0 &&
        packageServices.length === 0 &&
        youth?.requiresGuardian === false &&
        catalogue.bySlug['bikefit-huidige-fiets'].offering.variants.at(-1)?.serviceSlug ===
          'jeugdfit' &&
        catalogue.bySlug['bikefit-nieuwe-fiets'].offering.variants.at(-1)?.serviceId === null &&
        catalogue.bySlug['bikefit-tweede-bezoek'].offer.priceLabel ===
          OFFERING_TEXT_CORRECTIONS.find(
            (entry) => entry.slug === 'bikefit-tweede-bezoek',
          )?.to.priceText?.trim(),
      `${labels('bikefit-huidige-fiets')} | ${packages.length} package variant(s), ${packageServices.length} package service(s) | guardian ${youth?.requiresGuardian}`,
    );
    const winston = await subscriptions(fx.winstonId);
    const toshoni = await subscriptions(fx.toshoniId);
    const providers = (await listPublicProviders()).map((provider) => provider.displayName);
    check(
      'providers: Winston keeps his three offerings (the youth fit from the studio); Toshoni offers nothing and is gone from the public list, his profile stays',
      winston.some((row) => row.serviceId === youth?.id && row.locationId === fx.studioId) &&
        winston.length === 3 &&
        toshoni.length === 0 &&
        providers.join() === 'Winston' &&
        (
          await db
            .select()
            .from(schema.cmsProviders)
            .where(eq(schema.cmsProviders.id, fx.toshoniId))
        ).length === 1,
      `${providers.join()} | Winston ${winston.length}, Toshoni ${toshoni.length}`,
    );
    const jeugd = SERVICE_TEXT_CORRECTIONS.find((entry) => entry.slug === 'jeugdfit');
    const foot = await serviceRow('voetanalyse');
    check(
      'services: the copy of volwassenenfit and jeugdfit as the corrections say; the bookable voetanalyse takes 30 min; the prices stay',
      youth?.name === jeugd?.to.name &&
        youth?.choiceLabel === jeugd?.to.choiceLabel &&
        youth?.description === jeugd?.to.description &&
        foot?.durationMinutes === 30 &&
        youth?.priceCents === 15000,
      `${youth?.name} / ${foot?.durationMinutes} min`,
    );
    const menu = (await getNavigation(locale, 'main')).map((item) => item.label);
    const afspraak = await getPublishedPage(locale, 'afspraak');
    const home = await getPublishedPage(locale, '');
    const homeTitles = home?.snapshot.blocks.map(
      (block) => (block.data as { title?: string }).title ?? block.type,
    );
    const contactPage = await pageRow('contact');
    const contactBlock = (
      await db
        .select()
        .from(schema.cmsBlocks)
        .where(eq(schema.cmsBlocks.pageId, fx.pageIds.contact))
    )[0];
    check(
      'menu and pages: Cadeaubon before Contact; /afspraak ends with the location section; the home page has the voucher section after the catalogue; the retired contact page is still a draft with the number as a token; the retired page the repo would refuse is untouched',
      menu.indexOf('Cadeaubon') === menu.indexOf('Contact') - 1 &&
        afspraak?.snapshot.blocks.at(-1)?.type === 'location' &&
        home?.snapshot.blocks[1]?.type === 'offerCatalogue' &&
        homeTitles?.[2] === 'Geef fietsplezier cadeau' &&
        contactPage?.status === 'draft' &&
        (contactBlock.data as { phoneLabel?: string }).phoneLabel === PHONE_TOKEN &&
        (
          await db
            .select()
            .from(schema.cmsBlocks)
            .where(eq(schema.cmsBlocks.pageId, fx.pageIds['over-ons']))
        )[0].type === 'offer',
      `${menu.join(', ')} | ${homeTitles?.slice(0, 4).join(', ')}`,
    );

    const backup = backupPath ? await readCorrectiesBackup(backupPath) : null;
    const updatedPages = planned.filter((line) => line.startsWith('~ page ')).length;
    check(
      'backup: every touched page with its blocks, the menu, the settings, the location, the offerings, the services (Jeugdfit with its guardian rule), Toshoni’s three offerings',
      backup?.pages.length === updatedPages &&
        backup.menu !== null &&
        backup.settings.length >= 4 &&
        backup.location?.id === fx.studioId &&
        backup.offerings.length >= 1 &&
        backup.services.updated.some((entry) => entry.slug === 'voetanalyse') &&
        backup.services.updated.some(
          (entry) =>
            entry.slug === 'jeugdfit' &&
            entry.fields.includes('requiresGuardian') &&
            entry.row.requiresGuardian === true,
        ) &&
        backup.subscriptions.removed.length === 3 &&
        backup.subscriptions.providerId === fx.toshoniId,
      `${backup?.pages.length}/${updatedPages} pages`,
    );

    // --- 3: a second dry run finds nothing -------------------------------------------------------
    await run({ apply: false, restore: null });
    check(
      'a second dry run finds nothing to do: every line is as intended, no change, no blocker',
      lines.at(-1)?.includes('nothing to do') === true &&
        planLines(lines).every((line) => line.startsWith('=')) &&
        !lines.some((line) => line.startsWith('~') || line.startsWith('!')),
      planLines(lines)
        .filter((line) => !line.startsWith('='))
        .join(' | '),
    );
    await run({ apply: true, restore: null });
    check(
      'a second apply writes nothing: no new backup, no second audit entry',
      lines.some((line) => line.includes('nothing to do')) &&
        !lines.some((line) => line.includes('backup written')) &&
        (await auditCount('patch.aanbod-correcties.apply')) === applyAudits + 1,
    );

    // --- 4: restore, and apply again -------------------------------------------------------------
    if (backupPath) await run({ apply: false, restore: backupPath });
    check(
      'restore: every table is as before — pages and their published snapshots, menu, settings, location, offerings, services, subscriptions; Jeugdfit asks for a guardian again, Toshoni is public again',
      (await fingerprint(db, schema)) === before &&
        (await serviceRow('jeugdfit'))?.requiresGuardian === true &&
        (await listPublicProviders())
          .map((provider) => provider.displayName)
          .sort()
          .join() === 'Toshoni,Winston' &&
        (await sessions()) === sessionsBefore,
      lines.filter((line) => line.startsWith('!')).join(' | '),
    );

    // --- 5: what must block, and what must not -----------------------------------------------------
    await guardChecks({ ctx, kit, fx, afterApply });

    // --- 6: the state staging held on 27 Oct 2026 --------------------------------------------------
    await stagingChecks({ ctx, kit, original });

    // --- 7: production's exact editor copy, draft and published -----------------------------------
    await productionCopyChecks({ ctx, kit, original });

    // --- 8: staging with --staging-retain-toshoni --------------------------------------------------
    await retainChecks({ ctx, kit, original });
  } finally {
    // --- 9: clean-up -------------------------------------------------------------------------------
    await restoreState(db, schema, original);
    cookieJar.delete('cms_session');
  }
  check(
    'clean-up: pages, menu, settings, location, services, offerings, providers and subscriptions are as the sections before left them',
    (await fingerprint(db, schema)) === originalPrint,
  );
}
