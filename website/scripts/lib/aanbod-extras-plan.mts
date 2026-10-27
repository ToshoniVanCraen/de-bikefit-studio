/**
 * Read-only half of `npm run cms:patch-aanbod-extras`: reads the extra side of
 * every offering (columns, choices, links), plans per offering what would
 * change (the rules are the pure `decideExtras()` of
 * `aanbod-extras-targets.mts`), what blocks it, and prints the dry run. Never
 * writes; the dry run runs it against `readOnlyDb()`. The writing half
 * (backup, apply, verify, restore, mode dispatch) is `aanbod-extras-patch.mts`.
 *
 * What a plan line looks like on a database in the state of 20 Oct 2026
 * (staging and production, Toshoni's correction of 27 Oct 2026 not yet run):
 *
 *   ~ offering bikefit-nieuwe-fiets — extra's: bikefit-tweede-fiets (3 verwijderd)
 *   ~ offering bikefit-huidige-fiets — extra's: bikefit-tweede-fiets (3 verwijderd)
 *   = offering bikefit-tweede-fiets — as intended
 *   ~ offering voetanalyse — geen extra meer (was extra, 30 min)
 *   ~ offering zadelanalyse — geen extra meer (was extra, 60 min)
 *   ~ offering afstellen-schoenplaatjes — geen extra meer (was extra, 15 min)
 */
import { cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import { parseAddonChoices, type AddonChoice } from '@/lib/offers/offering';
import {
  decideExtras,
  extrasTargets,
  type ExtraColumns,
  type ExtrasTarget,
} from './aanbod-extras-targets.mjs';
import { withTransportRetry } from './aanbod-prices-plan.mjs';
import type { PlanDeps } from './aanbod-rollout.mjs';

/** One offering as stored: its extra columns, choices and links (by id, and by slug in the same order). */
export type StoredExtras = ExtraColumns & {
  id: string;
  slug: string;
  addonOptions: AddonChoice[];
  /** The linked extras, in order. */
  addonIds: string[];
  addonSlugs: string[];
};

export type ExtrasPlanEntry = {
  slug: string;
  action: 'update' | 'none' | 'blocked';
  stored: StoredExtras | null;
  target: ExtrasTarget;
  changes: string[];
  blockers: string[];
  /** The columns to write, when they change. */
  columns: ExtraColumns | null;
  /** The choices to write, when they change. */
  options: AddonChoice[] | null;
  /** The ids of the links the offering ends up with, in order, when they change. */
  linkIds: string[] | null;
};

/** An entry the apply writes: it has a stored row to back up and to update. */
export type PlannedUpdate = ExtrasPlanEntry & { stored: StoredExtras };

export type ExtrasPlan = {
  locale: string;
  entries: ExtrasPlanEntry[];
  guards: Record<string, number>;
};

/** Every offering of the locale with its extra columns, choices and links, by slug. */
async function readAllExtras(deps: PlanDeps): Promise<Map<string, StoredExtras>> {
  const { asc, eq, inArray } = deps.orm;
  const rows = await withTransportRetry(() =>
    deps.db
      .select({
        id: cmsOfferings.id,
        slug: cmsOfferings.slug,
        isAddon: cmsOfferings.isAddon,
        soldAlone: cmsOfferings.soldAlone,
        addonMinutes: cmsOfferings.addonMinutes,
        addonOptions: cmsOfferings.addonOptions,
      })
      .from(cmsOfferings)
      .where(eq(cmsOfferings.locale, deps.locale)),
  );
  const links =
    rows.length > 0
      ? await deps.db
          .select()
          .from(cmsOfferingAddons)
          .where(
            inArray(
              cmsOfferingAddons.offeringId,
              rows.map((row) => row.id),
            ),
          )
          .orderBy(asc(cmsOfferingAddons.sortOrder))
      : [];
  const slugOf = new Map(rows.map((row) => [row.id, row.slug]));
  const stored = new Map<string, StoredExtras>();
  for (const row of rows) {
    const own = links.filter((link) => link.offeringId === row.id);
    stored.set(row.slug, {
      id: row.id,
      slug: row.slug,
      isAddon: row.isAddon,
      soldAlone: row.soldAlone,
      addonMinutes: row.addonMinutes,
      addonOptions: parseAddonChoices(row.addonOptions),
      addonIds: own.map((link) => link.addonId),
      addonSlugs: own.map((link) => slugOf.get(link.addonId) ?? link.addonId),
    });
  }
  return stored;
}

/** Row counts that must not move: offerings, services, bookings (links are what the patch writes). */
export async function guardCountsExtras(deps: PlanDeps): Promise<Record<string, number>> {
  const [offerings, services, bookings, links] = await Promise.all([
    deps.db.select({ id: cmsOfferings.id }).from(cmsOfferings),
    deps.db.select({ id: deps.schema.cmsServices.id }).from(deps.schema.cmsServices),
    deps.db.select({ id: deps.schema.cmsBookings.id }).from(deps.schema.cmsBookings),
    deps.db.select({ id: cmsOfferingAddons.offeringId }).from(cmsOfferingAddons),
  ]);
  return {
    offerings: offerings.length,
    services: services.length,
    bookings: bookings.length,
    links: links.length,
  };
}

function planEntry(target: ExtrasTarget, stored: Map<string, StoredExtras>): ExtrasPlanEntry {
  const row = stored.get(target.slug) ?? null;
  if (!row) {
    return {
      slug: target.slug,
      action: 'blocked',
      stored: null,
      target,
      changes: [],
      blockers: [`offering ${target.slug} is missing — run cms:patch-aanbod-prijzen first`],
      columns: null,
      options: null,
      linkIds: null,
    };
  }
  const decision = decideExtras(target, row);
  const blockers = [...decision.blockers];
  let linkIds: string[] | null = null;
  if (decision.addonSlugs) {
    const ids: string[] = [];
    const missing: string[] = [];
    for (const slug of decision.addonSlugs) {
      const addon = stored.get(slug);
      if (addon) ids.push(addon.id);
      else missing.push(slug);
    }
    if (missing.length > 0) {
      blockers.push(`offering ${target.slug}: extra ${missing.join(', ')} is missing`);
    } else {
      linkIds = ids;
    }
  }
  return {
    slug: target.slug,
    action: blockers.length > 0 ? 'blocked' : decision.changes.length > 0 ? 'update' : 'none',
    stored: row,
    target,
    changes: decision.changes,
    blockers,
    columns: decision.columns,
    options: decision.options,
    linkIds,
  };
}

export async function planAanbodExtras(deps: PlanDeps): Promise<ExtrasPlan> {
  const stored = await readAllExtras(deps);
  const entries = extrasTargets().map((target) => planEntry(target, stored));
  return { locale: deps.locale, entries, guards: await guardCountsExtras(deps) };
}

export function extrasBlockers(plan: ExtrasPlan): string[] {
  return plan.entries.flatMap((entry) => entry.blockers);
}

export function extrasHasChanges(plan: ExtrasPlan): boolean {
  return plan.entries.some((entry) => entry.action === 'update');
}

/** The entries the apply writes (and backs up), in plan order. */
export function plannedUpdates(plan: ExtrasPlan): PlannedUpdate[] {
  return plan.entries.filter(
    (entry): entry is PlannedUpdate => entry.action === 'update' && entry.stored !== null,
  );
}

export function printExtrasPlan(plan: ExtrasPlan, log: PlanDeps['log']): void {
  for (const entry of plan.entries) {
    if (entry.action === 'update') log('~', `offering ${entry.slug} — ${entry.changes.join('; ')}`);
    else if (entry.action === 'none') log('=', `offering ${entry.slug} — as intended`);
  }
  log(
    '=',
    `guards: ${Object.entries(plan.guards)
      .map(([key, value]) => `${key} ${value}`)
      .join(', ')}`,
  );
}
