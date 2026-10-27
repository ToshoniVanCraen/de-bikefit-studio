/**
 * Self-test section 17c, part 4: `cms:patch-aanbod-extras` on the throwaway
 * PGlite, on the nine offerings `aanbod-extras.mts` bootstrapped. The database
 * is put in each state the patch has to know, and the patch is driven through
 * the entry point of the CLI (`run()` of the kit):
 *
 * A. fresh, as migration 0015 leaves it: the dry run writes nothing; apply
 *    writes the second bike and the links of both bikefits, verifies, audits;
 *    a second dry run finds nothing; restore puts the bare state back;
 * B. an edit made in Beheer (an analysis with other extra minutes) blocks the
 *    dry run (`!`) and the apply, nothing written;
 * C. the state of 20 Oct 2026, which staging and production hold (Toshoni,
 *    27 Oct 2026 corrects it): the three analyses are extras (+30 / +60 / +15
 *    min), both bikefits link to four extras. The dry run prints the
 *    transition, apply unflags the analyses and prunes the links down to the
 *    second bike (backup of the rows that change, verified against the public
 *    catalogue), a second dry run finds nothing, restore returns the state of
 *    20 Oct, apply again;
 * D. a bikefit with links of its own (one of the four removed in Beheer) is
 *    left alone.
 *
 * The caller cleans up.
 */
import * as orm from 'drizzle-orm';
import { cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import { readExtrasBackup } from '../lib/aanbod-extras-patch.mjs';
import { createExtrasKit, type ExtrasSectionContext } from './aanbod-extras-kit.mjs';

const { and, eq } = orm;

const SECOND_BIKE = 'bikefit-tweede-fiets';
const BIKEFITS = ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets'];
/** The analyses with the extra minutes the first version of the patch gave them (20 Oct 2026). */
const ANALYSES_OF_20_OCT: ReadonlyArray<readonly [string, number]> = [
  ['voetanalyse', 30],
  ['zadelanalyse', 60],
  ['afstellen-schoenplaatjes', 15],
];
/** The four extras each bikefit linked to on 20 Oct 2026, in order. */
const LINKS_OF_20_OCT = [SECOND_BIKE, 'voetanalyse', 'zadelanalyse', 'afstellen-schoenplaatjes'];
const CHOICES = [
  { key: 'zelfde-type', label: 'Zelfde type fiets', minutes: 30, priceCents: 7500 },
  { key: 'ander-type', label: 'Ander type fiets', minutes: 60, priceCents: 15000 },
];

type OfferingColumns = Partial<typeof cmsOfferings.$inferInsert>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The lines of the last run that name an offering or block the patch. */
const planLines = (lines: readonly string[]) =>
  lines.filter((line) => /^(~ offering|= offering|!)/.test(line));

const backupPathOf = (lines: readonly string[]) =>
  lines.find((line) => line.startsWith('✓ backup written: '))?.slice('✓ backup written: '.length);

export async function aanbodExtrasPatchSection(ctx: ExtrasSectionContext) {
  const { db, check } = ctx;
  const { locale, lines, run, offeringRow, linkSlugs, linkCount, auditCount } =
    await createExtrasKit(ctx);
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');

  const idOf = async (slug: string) => {
    const row = await offeringRow(slug);
    if (!row) throw new Error(`self-test 17c: offering ${slug} is missing`);
    return row.id;
  };
  const setColumns = (slug: string, values: OfferingColumns) =>
    db
      .update(cmsOfferings)
      .set(values)
      .where(and(eq(cmsOfferings.locale, locale), eq(cmsOfferings.slug, slug)));
  const setLinks = async (slug: string, linked: readonly string[]) => {
    const offeringId = await idOf(slug);
    await db.delete(cmsOfferingAddons).where(eq(cmsOfferingAddons.offeringId, offeringId));
    for (const [index, addon] of linked.entries()) {
      await db
        .insert(cmsOfferingAddons)
        .values({ offeringId, addonId: await idOf(addon), sortOrder: index });
    }
  };

  /** Migration 0015 only: no extra, sold alone, no choices, no links. */
  const setFresh = async () => {
    await db
      .update(cmsOfferings)
      .set({ isAddon: false, soldAlone: true, addonMinutes: null, addonOptions: [] })
      .where(eq(cmsOfferings.locale, locale));
    await db.delete(cmsOfferingAddons);
  };
  /** The first version of the patch (20 Oct 2026), as staging and production hold it. */
  const setStateOf20Oct = async () => {
    await setFresh();
    for (const [slug, minutes] of ANALYSES_OF_20_OCT) {
      await setColumns(slug, { isAddon: true, addonMinutes: minutes });
    }
    await setColumns(SECOND_BIKE, {
      isAddon: true,
      soldAlone: false,
      addonMinutes: 30,
      addonOptions: CHOICES,
    });
    for (const slug of BIKEFITS) await setLinks(slug, LINKS_OF_20_OCT);
  };

  /** The three analyses are extras with the minutes of 20 Oct, sold alone. */
  const analysesAreExtras = async () => {
    for (const [slug, minutes] of ANALYSES_OF_20_OCT) {
      const row = await offeringRow(slug);
      if (
        !(row?.isAddon === true && row.soldAlone === true && row.addonMinutes === minutes) ||
        row.addonOptions.length > 0
      ) {
        return false;
      }
    }
    return true;
  };
  /** The three analyses are no extra: sold alone, no minutes, no choices. */
  const analysesAreNoExtra = async () => {
    for (const [slug] of ANALYSES_OF_20_OCT) {
      const row = await offeringRow(slug);
      if (
        !(row?.isAddon === false && row.soldAlone === true && row.addonMinutes === null) ||
        row.addonOptions.length > 0
      ) {
        return false;
      }
    }
    return true;
  };
  /** Tweede fiets as the defaults have it: an extra only, 30 min, its two choices. */
  const secondBikeIsTheExtra = async () => {
    const row = await offeringRow(SECOND_BIKE);
    return (
      row?.isAddon === true &&
      row.soldAlone === false &&
      row.addonMinutes === 30 &&
      same(row.addonOptions, CHOICES)
    );
  };
  const bikefitLinks = async () =>
    Promise.all(BIKEFITS.map(async (slug) => (await linkSlugs(slug)).join(',')));

  // --- A: a fresh database (migration 0015 only) -------------------------------------
  await setFresh();
  const auditBefore = await auditCount();
  await run({ apply: false, restore: null });
  check(
    'fresh: the dry run plans the second bike and both bikefit links, the analyses are as intended; nothing written, no audit entry',
    same(planLines(lines), [
      "~ offering bikefit-nieuwe-fiets — extra's: + bikefit-tweede-fiets",
      "~ offering bikefit-huidige-fiets — extra's: + bikefit-tweede-fiets",
      '~ offering bikefit-tweede-fiets — als extra te boeken, enkel als extra, +30 min; keuzes: zelfde-type (30 min, 7500 cent), ander-type (60 min, 15000 cent)',
      '= offering voetanalyse — as intended',
      '= offering zadelanalyse — as intended',
      '= offering afstellen-schoenplaatjes — as intended',
    ]) &&
      lines.at(-1)?.includes('run again with --apply') === true &&
      (await offeringRow(SECOND_BIKE))?.isAddon === false &&
      (await linkCount()) === 0 &&
      (await auditCount()) === auditBefore,
    planLines(lines).join(' | '),
  );

  const applyAudits = await auditCount('patch.aanbod-extras.apply');
  const updateAudits = await auditCount('offering.update');
  await run({ apply: true, restore: null });
  const freshBackup = backupPathOf(lines);
  check(
    'fresh: apply writes the second bike and the links, verifies the catalogue, audits (3 offerings), writes a backup',
    lines.some((line) => line.startsWith('✓ apply complete')) &&
      lines.some((line) => line.startsWith('✓ offerings and the public catalogue verified')) &&
      Boolean(freshBackup) &&
      (await secondBikeIsTheExtra()) &&
      same(await bikefitLinks(), [SECOND_BIKE, SECOND_BIKE]) &&
      (await analysesAreNoExtra()) &&
      (await linkCount()) === 2 &&
      (await auditCount('patch.aanbod-extras.apply')) === applyAudits + 1 &&
      (await auditCount('offering.update')) === updateAudits + 3,
    lines.filter((line) => /^[~!✓]/.test(line)).join(' | '),
  );
  await run({ apply: false, restore: null });
  check(
    'fresh: a second dry run finds nothing to do — all six offerings as intended',
    lines.at(-1)?.includes('nothing to do') === true &&
      planLines(lines).length === 6 &&
      planLines(lines).every((line) => line.startsWith('= offering')),
    planLines(lines).join(' | '),
  );
  if (freshBackup) {
    await run({ apply: false, restore: freshBackup });
    check(
      'fresh: restore puts the bare state of migration 0015 back',
      (await offeringRow(SECOND_BIKE))?.isAddon === false &&
        (await offeringRow(SECOND_BIKE))?.soldAlone === true &&
        (await offeringRow(SECOND_BIKE))?.addonOptions.length === 0 &&
        (await linkCount()) === 0,
      lines.join(' | '),
    );
  }

  // --- B: an edit made in Beheer blocks the patch ----------------------------------------
  await setFresh();
  await setColumns('voetanalyse', { isAddon: true, addonMinutes: 45 });
  await run({ apply: false, restore: null });
  const blocked = lines.filter((line) => line.startsWith('!'));
  const blockedDryRun = lines.at(-1)?.includes('blocked') === true;
  const appliesBefore = await auditCount('patch.aanbod-extras.apply');
  let refused = false;
  try {
    await run({ apply: true, restore: null });
  } catch {
    refused = true;
  }
  check(
    'guard: an analysis whose extra time was changed in Beheer blocks the dry run (!) and the apply; nothing written',
    blocked.length === 1 &&
      blocked[0].includes('offering voetanalyse') &&
      blocked[0].includes('+45 min') &&
      blockedDryRun &&
      refused &&
      (await linkCount()) === 0 &&
      (await offeringRow(SECOND_BIKE))?.isAddon === false &&
      (await auditCount('patch.aanbod-extras.apply')) === appliesBefore,
    blocked.join(' | '),
  );

  // --- C: the state of 20 Oct 2026 (staging and production) --------------------------------
  await setStateOf20Oct();
  check(
    'fixture: the state of 20 Oct 2026 — the three analyses are extras, both bikefits link to four extras (8 link rows)',
    (await analysesAreExtras()) &&
      (await secondBikeIsTheExtra()) &&
      same(await bikefitLinks(), [LINKS_OF_20_OCT.join(','), LINKS_OF_20_OCT.join(',')]) &&
      (await linkCount()) === 8,
  );
  const applyAuditsC = await auditCount('patch.aanbod-extras.apply');
  const updateAuditsC = await auditCount('offering.update');
  await run({ apply: false, restore: null });
  check(
    '20 Oct state: the dry run unflags the three analyses and prunes three links on each bikefit; the second bike is as intended; nothing written',
    same(planLines(lines), [
      "~ offering bikefit-nieuwe-fiets — extra's: bikefit-tweede-fiets (3 verwijderd)",
      "~ offering bikefit-huidige-fiets — extra's: bikefit-tweede-fiets (3 verwijderd)",
      '= offering bikefit-tweede-fiets — as intended',
      '~ offering voetanalyse — geen extra meer (was extra, 30 min)',
      '~ offering zadelanalyse — geen extra meer (was extra, 60 min)',
      '~ offering afstellen-schoenplaatjes — geen extra meer (was extra, 15 min)',
    ]) &&
      lines.some((line) => line.startsWith('= guards: ') && line.includes('links 8')) &&
      lines.at(-1)?.includes('run again with --apply') === true &&
      (await analysesAreExtras()) &&
      (await linkCount()) === 8 &&
      (await auditCount('offering.update')) === updateAuditsC,
    planLines(lines).join(' | '),
  );

  await run({ apply: true, restore: null });
  const transitionBackup = backupPathOf(lines);
  const applyLines = lines.filter((line) => /^[~!✓]/.test(line)).join(' | ');
  check(
    '20 Oct state: apply unflags the analyses and prunes the links, verifies the catalogue, audits (5 offerings), keeps the second bike',
    lines.some((line) => line.startsWith('✓ apply complete')) &&
      lines.some((line) => line.startsWith('✓ offerings and the public catalogue verified')) &&
      Boolean(transitionBackup) &&
      (await analysesAreNoExtra()) &&
      (await secondBikeIsTheExtra()) &&
      same(await bikefitLinks(), [SECOND_BIKE, SECOND_BIKE]) &&
      (await linkCount()) === 2 &&
      (await auditCount('patch.aanbod-extras.apply')) === applyAuditsC + 1 &&
      (await auditCount('offering.update')) === updateAuditsC + 5,
    applyLines,
  );

  const catalogue = await loadOfferCatalogue(locale);
  const hostServices = (catalogue.bySlug['bikefit-huidige-fiets']?.offering.variants ?? []).flatMap(
    (variant) => (variant.serviceId ? [variant.serviceId] : []),
  );
  check(
    'catalogue after the transition: a bikefit offers the two choices of tweede fiets and nothing else; the analyses are no extra, listed and asked for',
    hostServices.length > 0 &&
      hostServices.every((serviceId) =>
        same(
          (catalogue.addonsByService[serviceId] ?? []).map(
            (option) => `${option.slug}#${option.optionKey}`,
          ),
          ['bikefit-tweede-fiets#zelfde-type', 'bikefit-tweede-fiets#ander-type'],
        ),
      ) &&
      ANALYSES_OF_20_OCT.every(([slug]) => {
        const entry = catalogue.bySlug[slug];
        return (
          entry?.offering.status === 'enquiry' &&
          entry.offering.isAddon === false &&
          catalogue.offers.some((offer) => offer.slug === slug)
        );
      }),
    hostServices.map((serviceId) => catalogue.addonsByService[serviceId]?.length ?? 0).join(','),
  );

  const backup = transitionBackup ? await readExtrasBackup(transitionBackup) : null;
  check(
    '20 Oct state: the backup holds the five rows that change, as they were (analyses flagged, four links per bikefit), not the second bike',
    same(
      backup?.offerings.map(
        (row) => `${row.slug}:${row.isAddon}:${row.addonMinutes}:${row.addonIds.length}`,
      ),
      [
        'bikefit-nieuwe-fiets:false:null:4',
        'bikefit-huidige-fiets:false:null:4',
        'voetanalyse:true:30:0',
        'zadelanalyse:true:60:0',
        'afstellen-schoenplaatjes:true:15:0',
      ],
    ),
    backup?.offerings.map((row) => row.slug).join(','),
  );

  await run({ apply: false, restore: null });
  check(
    '20 Oct state: after the apply a dry run finds nothing to do',
    lines.at(-1)?.includes('nothing to do') === true &&
      planLines(lines).length === 6 &&
      planLines(lines).every((line) => line.startsWith('= offering')),
    planLines(lines).join(' | '),
  );

  if (transitionBackup) {
    await run({ apply: false, restore: transitionBackup });
    check(
      '20 Oct state: restore returns it — the analyses are extras again (30 / 60 / 15 min), both bikefits link to the four extras in order',
      (await analysesAreExtras()) &&
        (await secondBikeIsTheExtra()) &&
        same(await bikefitLinks(), [LINKS_OF_20_OCT.join(','), LINKS_OF_20_OCT.join(',')]) &&
        (await linkCount()) === 8,
      lines.join(' | '),
    );
  }
  await run({ apply: true, restore: null });
  check(
    '20 Oct state: apply again — the target is back',
    (await analysesAreNoExtra()) &&
      same(await bikefitLinks(), [SECOND_BIKE, SECOND_BIKE]) &&
      (await linkCount()) === 2,
    lines.filter((line) => /^[~!✓]/.test(line)).join(' | '),
  );

  // --- D: a bikefit with links of its own is left alone -----------------------------------------
  await setStateOf20Oct();
  await setLinks('bikefit-huidige-fiets', [SECOND_BIKE, 'voetanalyse', 'zadelanalyse']);
  await run({ apply: false, restore: null });
  check(
    'guard: a bikefit that lost one of the four links in Beheer blocks the dry run (!); the others are still planned',
    same(
      lines.filter((line) => line.startsWith('!')),
      [
        "! offering bikefit-huidige-fiets: has its own extra's (bikefit-tweede-fiets, voetanalyse, zadelanalyse) — not touched",
      ],
    ) &&
      lines.some((line) => line.startsWith('~ offering voetanalyse')) &&
      lines.at(-1)?.includes('blocked') === true &&
      (await linkCount()) === 7,
    lines.filter((line) => /^[~!]/.test(line)).join(' | '),
  );
}
