/**
 * Read-only half of `npm run cms:patch-aanbod-correcties`, part two: the plan.
 * A pure function of the rows ({@link World}, read by `aanbod-correcties-world.mts`):
 * per section what would change, what blocks it and what the apply must write.
 * Never writes, never reads; the printout is `aanbod-correcties-print.mts`, the
 * writing half `aanbod-correcties-patch.mts`. The rules of the small sections
 * are `aanbod-correcties-targets.mts`, those of the youth package and the
 * provider `aanbod-correcties-youth.mts`, those of the pages
 * `aanbod-correcties-pages.mts`; the page and the booking-service sections are
 * planned in `aanbod-correcties-plan-pages.mts` and `-plan-booking.mts`.
 *
 * Sections, in the order the apply writes them:
 *
 *   settings   Instellingen → Contact (address, phone), the SEO default texts and
 *              every settings group that has no row yet
 *   location   the address of the studio's booking location
 *   packages   the third variant "Jeugd – volledig pakket" of both bikefits, its
 *              service and its providers
 *   services   the copy of the booking services, and their durations
 *   offerings  the copy of the nine offerings
 *   provider   Toshoni's offerings as Aanbieder: they go, or with `staging-retain`
 *              (`--staging-retain-toshoni`, staging only) they all stay
 *   menu       "Cadeaubon" in the main menu
 *   pages      every page: the corrections of the day, the contact details, the
 *              location section, the gift voucher promotion; published last
 */
import { validateNavigationItems } from '@/lib/cms/blocks';
import type { NavigationItem } from '@/lib/cms/blocks';
import {
  OFFERING_TEXT_CORRECTIONS,
  SERVICE_TEXT_CORRECTIONS,
  type OfferingTextCorrection,
  type ServiceTextCorrection,
} from '@/lib/offers/corrections-2026-10-27';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { contentFromRow, validateOfferingContent } from '@/lib/offers/offering-content';
import {
  SETTING_TEXT_CORRECTIONS,
  type SettingTextCorrection,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import { STUDIO_LOCATION_ADDRESS } from '@/lib/studio/seed-content/location-section';
import { PAGE_SOURCES, type PageSources } from './aanbod-correcties-pages.mjs';
import {
  planDurations,
  planPackages,
  planProvider,
  planServiceTexts,
  type DurationPlan,
  type DurationTarget,
  type PackagePlan,
  type ProviderPlan,
  type ServicePlan,
  type YouthPackageTarget,
} from './aanbod-correcties-plan-booking.mjs';
import { planPages, type PagePlan } from './aanbod-correcties-plan-pages.mjs';
import { statusOf, type Planned } from './aanbod-correcties-status.mjs';
import type { ProviderMode } from './aanbod-correcties-youth.mjs';
import {
  decideAddress,
  decideContact,
  decideMenu,
  decideSettingTexts,
  decideTexts,
  defaultSettingValue,
  DURATION_TARGETS,
  missingSettingKeys,
} from './aanbod-correcties-targets.mjs';
import type {
  Counts,
  LocationRowFull,
  OfferingRowFull,
  World,
} from './aanbod-correcties-world.mjs';

export type CorrectiesInputs = {
  pages: PageSources;
  settingTexts: ReadonlyArray<SettingTextCorrection>;
  offeringTexts: ReadonlyArray<OfferingTextCorrection>;
  serviceTexts: ReadonlyArray<ServiceTextCorrection>;
  durations: ReadonlyArray<DurationTarget>;
  youthPackages: ReadonlyArray<YouthPackageTarget>;
};

export function defaultInputs(): CorrectiesInputs {
  return {
    pages: PAGE_SOURCES,
    settingTexts: SETTING_TEXT_CORRECTIONS,
    offeringTexts: OFFERING_TEXT_CORRECTIONS,
    serviceTexts: SERVICE_TEXT_CORRECTIONS,
    durations: DURATION_TARGETS,
    youthPackages: DEFAULT_OFFERS.flatMap((offering) => {
      const third = offering.variants.find((variant) => variant.audience === 'youth-package');
      if (!third || third.priceCents === null) return [];
      const youth = offering.variants.find((variant) => variant.audience === 'youth');
      return [
        {
          slug: offering.content.slug,
          priceCents: third.priceCents,
          defaultYouthServiceSlug: youth?.serviceSlug ?? null,
        },
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export type SettingPlan = Planned & {
  key: string;
  /** A row exists (else the apply creates it from the schema defaults). */
  existed: boolean;
  before: unknown;
  /** The value to write. */
  value: unknown;
  /** Why a field is left alone (the studio's own text); not a blocker. */
  notes: string[];
};
export type LocationPlan = Planned & { row: LocationRowFull | null };
export type MenuPlan = Planned & { before: unknown; items: NavigationItem[] | null };
export type OfferingPlan = Planned & {
  slug: string;
  row: OfferingRowFull | null;
  writes: Record<string, unknown>;
  before: Record<string, unknown>;
};

// The other sections' entries, so a caller imports every plan type from here.
export type {
  DurationPlan,
  PackagePlan,
  ProviderPlan,
  ServicePlan,
} from './aanbod-correcties-plan-booking.mjs';
export type { PagePlan } from './aanbod-correcties-plan-pages.mjs';

export type CorrectiesPlan = {
  locale: string;
  /** What happens to Toshoni's offerings; the apply, its backup and its verify follow it. */
  providerMode: ProviderMode;
  settings: SettingPlan[];
  location: LocationPlan;
  menu: MenuPlan;
  pages: PagePlan[];
  offerings: OfferingPlan[];
  packages: PackagePlan[];
  services: ServicePlan[];
  durations: DurationPlan[];
  provider: ProviderPlan;
  /** Row counts now, and what the apply must leave (bookings and providers never move). */
  guards: Counts;
  expected: Counts;
};

const asRecord = (row: object) => row as unknown as Record<string, unknown>;

function planSettings(world: World, texts: CorrectiesInputs['settingTexts']): SettingPlan[] {
  const plans: SettingPlan[] = [];
  const stored = (key: string) => world.settings.get(key);

  // Instellingen → Contact: the address and the phone number.
  if (world.settings.has('contact')) {
    const decision = decideContact(stored('contact'));
    plans.push({
      key: 'contact',
      existed: true,
      before: stored('contact'),
      value: decision.value,
      changes: decision.changes,
      blockers: decision.blockers,
      notes: [],
      action: statusOf(decision.blockers, decision.changes),
    });
  } else {
    plans.push({
      key: 'contact',
      existed: false,
      before: null,
      value: null,
      changes: [],
      blockers: ['setting contact is missing — run cms:bootstrap first'],
      notes: [],
      action: 'blocked',
    });
  }

  // The default texts the clean-up changes (the SEO title and description lose their dashes).
  for (const key of [...new Set(texts.map((entry) => entry.key))]) {
    if (!world.settings.has(key)) continue; // a missing row is written from the schema defaults below
    const decision = decideSettingTexts(key, stored(key), texts);
    plans.push({
      key,
      existed: true,
      before: stored(key),
      value: decision.value,
      changes: decision.changes,
      blockers: [],
      notes: decision.notes,
      action: statusOf([], decision.changes),
    });
  }

  // Every group of the schema that has no row yet gets its defaults.
  for (const key of missingSettingKeys(new Set(world.settings.keys()))) {
    if (key === 'contact') continue;
    const value = defaultSettingValue(key);
    const blockers = value === null ? [`setting ${key}: the schema has no defaults to write`] : [];
    const changes = value === null ? [] : ['new row with the schema defaults'];
    plans.push({
      key,
      existed: false,
      before: null,
      value,
      changes,
      blockers,
      notes: [],
      action: statusOf(blockers, changes),
    });
  }
  return plans;
}

function planLocation(world: World): LocationPlan {
  const studio = world.locations.find((row) => row.kind === 'studio' && row.isDefault) ?? null;
  if (!studio) {
    return {
      row: null,
      changes: [],
      blockers: ['location: there is no default studio location — run cms:bootstrap first'],
      action: 'blocked',
    };
  }
  const decision = decideAddress(studio, STUDIO_LOCATION_ADDRESS);
  const changes = decision.action === 'update' ? [decision.change] : [];
  const blockers =
    decision.action === 'blocked' ? [`location ${studio.name}: ${decision.blocker}`] : [];
  return { row: studio, changes, blockers, action: statusOf(blockers, changes) };
}

function planMenu(world: World): MenuPlan {
  const { exists, items } = world.mainMenu;
  const parsed = exists ? validateNavigationItems(items) : null;
  if (!parsed?.ok) {
    return {
      before: items,
      items: null,
      changes: [],
      blockers: [exists ? 'menu main does not validate' : 'menu main is missing'],
      action: 'blocked',
    };
  }
  const decision = decideMenu(parsed.items);
  const changes = decision.items ? [decision.change] : [];
  return {
    before: items,
    items: decision.items,
    changes,
    blockers: [],
    action: statusOf([], changes),
  };
}

function planOfferingTexts(
  world: World,
  corrections: ReadonlyArray<OfferingTextCorrection>,
): OfferingPlan[] {
  return corrections.map((correction) => {
    const row = world.offerings.find((entry) => entry.slug === correction.slug) ?? null;
    if (!row) {
      return {
        slug: correction.slug,
        row: null,
        writes: {},
        before: {},
        changes: [],
        blockers: [`offering ${correction.slug}: missing — run cms:patch-aanbod-prijzen first`],
        action: 'blocked' as const,
      };
    }
    const decision = decideTexts(
      `offering ${correction.slug}`,
      asRecord(row),
      correction.from,
      correction.to,
    );
    const blockers = [...decision.blockers];
    if (blockers.length === 0 && Object.keys(decision.writes).length > 0) {
      const merged = validateOfferingContent({ ...contentFromRow(row), ...decision.writes });
      if (!merged.ok) {
        blockers.push(
          `offering ${correction.slug}: the new text does not validate (${merged.message})`,
        );
      }
    }
    return {
      slug: correction.slug,
      row,
      writes: decision.writes,
      before: decision.before,
      changes: decision.changes,
      blockers,
      action: statusOf(blockers, decision.changes),
    };
  });
}

function expectedCounts(plan: Omit<CorrectiesPlan, 'expected'>): Counts {
  const { guards } = plan;
  const added = plan.pages.reduce((sum, page) => sum + page.ops.inserts.length, 0);
  const removed = plan.pages.reduce((sum, page) => sum + page.ops.deletes.length, 0);
  return {
    ...guards,
    blocks: guards.blocks + added - removed,
    variants: guards.variants + plan.packages.filter((entry) => entry.variant === 'create').length,
    services:
      guards.services + plan.packages.filter((entry) => entry.service.kind === 'create').length,
    subscriptions:
      guards.subscriptions -
      plan.provider.rows.length +
      plan.packages.reduce((sum, entry) => sum + entry.subscribe.length, 0),
  };
}

export function planCorrecties(
  world: World,
  inputs: CorrectiesInputs = defaultInputs(),
  providerMode: ProviderMode = 'remove',
): CorrectiesPlan {
  const packages = planPackages(world, inputs.youthPackages, providerMode);
  const base = {
    locale: world.locale,
    providerMode,
    settings: planSettings(world, inputs.settingTexts),
    location: planLocation(world),
    menu: planMenu(world),
    pages: planPages(world, inputs.pages),
    offerings: planOfferingTexts(world, inputs.offeringTexts),
    packages,
    services: planServiceTexts(world, inputs.serviceTexts),
    durations: planDurations(world, inputs.durations),
    provider: planProvider(world, packages, providerMode),
    guards: world.counts,
  };
  return { ...base, expected: expectedCounts(base) };
}

// ---------------------------------------------------------------------------
// Reading the plan
// ---------------------------------------------------------------------------

/** Every section's entries, for the checks that look at all of them. */
function entries(plan: CorrectiesPlan): Planned[] {
  return [
    ...plan.settings,
    plan.location,
    plan.menu,
    ...plan.pages,
    ...plan.offerings,
    ...plan.packages,
    ...plan.services,
    ...plan.durations,
    plan.provider,
  ];
}

export function correctiesBlockers(plan: CorrectiesPlan): string[] {
  return entries(plan).flatMap((entry) => entry.blockers);
}

export function correctiesHasChanges(plan: CorrectiesPlan): boolean {
  return entries(plan).some((entry) => entry.action === 'update');
}
