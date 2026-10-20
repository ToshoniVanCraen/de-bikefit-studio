/**
 * Core of `npm run cms:patch-aanbod-extras` (and self-test section 17c):
 * Toshoni's extra's of 20 Oct 2026 on an EXISTING database — and nothing
 * else. The values are the defaults (`src/lib/offers/defaults.ts`):
 *
 *   extras    voetanalyse, zadelanalyse, afstellen-schoenplaatjes: as extra
 *             to book (+30 / +60 / +15 min), still sold alone;
 *             bikefit-tweede-fiets: an extra only (+30 min), never alone
 *   links     bikefit-nieuwe-fiets and bikefit-huidige-fiets allow those four
 *             extras, in that order (`cms_offering_addons`)
 *
 * Never touched: the copy, prices and variants of any offering, pages,
 * settings, services, providers, bookings. Only the three extra columns of
 * `cms_offerings` and the link table; the row counts of offerings, services
 * and bookings are checked before and after.
 *
 *   plan     read-only; refuses (`!`) when an offering is missing (run
 *            cms:patch-aanbod-prijzen first), when its extra columns were
 *            changed in Beheer since migration 0015, or when it already has
 *            its own extras
 *   apply    writes a JSON backup FIRST (the extra columns and links of every
 *            offering it changes), then the columns and links, verifies with
 *            a second plan and the public catalogue, audits
 *            `patch.aanbod-extras.apply`
 *   restore  puts the backed-up columns and links back
 *
 * Dry run: no session, no audit entry, planned against `readOnlyDb()`.
 * Writing modes load their modules before the first query (the Neon lesson
 * of the prices patch), open one short-lived admin session and always
 * revoke it.
 */
import { z } from 'zod';

import { cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import { DEFAULT_OFFERS, type DefaultOffering } from '@/lib/offers/defaults';
import { withTransportRetry } from './aanbod-prices-plan.mjs';
import { stable, writeBackup, type PlanDeps, type RolloutDeps } from './aanbod-rollout.mjs';
import {
  findActor,
  readOnlyDb,
  withAdminSession,
  type RolloutRunContext,
} from './aanbod-rollout-run.mjs';

const OFFERING_CACHE_TAGS = ['cms', 'cms:offerings', 'booking'];

// ---------------------------------------------------------------------------
// Targets and plan
// ---------------------------------------------------------------------------

/** What the patch sets on one offering: the three extra columns and the linked extras (slugs). */
export type ExtrasTarget = {
  slug: string;
  isAddon: boolean;
  soldAlone: boolean;
  addonMinutes: number | null;
  addonSlugs: string[];
};

type ExtraColumns = Pick<ExtrasTarget, 'isAddon' | 'soldAlone' | 'addonMinutes'>;

/** What migration 0015 leaves on every row. */
const UNSET: ExtraColumns = { isAddon: false, soldAlone: true, addonMinutes: null };

/** The defaults with something on the extra side (six of the nine, 20 Oct 2026). */
export function extrasTargets(
  defaults: readonly DefaultOffering[] = DEFAULT_OFFERS,
): ExtrasTarget[] {
  return defaults
    .filter(
      (entry) =>
        entry.isAddon ||
        !entry.soldAlone ||
        entry.addonMinutes != null ||
        entry.addonSlugs.length > 0,
    )
    .map((entry) => ({
      slug: entry.content.slug,
      isAddon: entry.isAddon,
      soldAlone: entry.soldAlone,
      addonMinutes: entry.addonMinutes,
      addonSlugs: [...entry.addonSlugs],
    }));
}

export type StoredExtras = ExtraColumns & {
  id: string;
  slug: string;
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
  /** The link ids to write, when they change. */
  linkIds: string[] | null;
};

export type ExtrasPlan = {
  locale: string;
  entries: ExtrasPlanEntry[];
  guards: Record<string, number>;
};

function describeColumns(columns: ExtraColumns): string {
  return [
    columns.isAddon ? 'als extra te boeken' : 'geen extra',
    columns.soldAlone ? 'ook apart' : 'enkel als extra',
    columns.addonMinutes != null ? `+${columns.addonMinutes} min` : 'geen extra tijd',
  ].join(', ');
}

/** Every offering of the locale with its extra columns and links, by slug. */
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
      ...row,
      addonIds: own.map((link) => link.addonId),
      addonSlugs: own.map((link) => slugOf.get(link.addonId) ?? link.addonId),
    });
  }
  return stored;
}

/** Row counts that must not move: offerings, services, bookings (links are what the patch writes). */
export async function guardCountsExtras(deps: PlanDeps): Promise<Record<string, number>> {
  const count = async (table: Parameters<typeof deps.db.select>[0] extends never ? never : never) =>
    void table;
  void count;
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

export async function planAanbodExtras(deps: PlanDeps): Promise<ExtrasPlan> {
  const stored = await readAllExtras(deps);
  const entries: ExtrasPlanEntry[] = extrasTargets().map((target) => {
    const row = stored.get(target.slug) ?? null;
    const changes: string[] = [];
    const blockers: string[] = [];
    let columns: ExtraColumns | null = null;
    let linkIds: string[] | null = null;
    if (!row) {
      blockers.push(`offering ${target.slug} is missing — run cms:patch-aanbod-prijzen first`);
      return {
        slug: target.slug,
        action: 'blocked',
        stored: null,
        target,
        changes,
        blockers,
        columns,
        linkIds,
      };
    }
    const current: ExtraColumns = {
      isAddon: row.isAddon,
      soldAlone: row.soldAlone,
      addonMinutes: row.addonMinutes,
    };
    const wanted: ExtraColumns = {
      isAddon: target.isAddon,
      soldAlone: target.soldAlone,
      addonMinutes: target.addonMinutes,
    };
    if (stable(current) !== stable(wanted)) {
      if (stable(current) === stable(UNSET)) {
        columns = wanted;
        changes.push(describeColumns(wanted));
      } else {
        blockers.push(
          `offering ${target.slug}: the extra settings were changed in Beheer (${describeColumns(current)}) — not touched`,
        );
      }
    }
    if (stable(row.addonSlugs) !== stable(target.addonSlugs)) {
      if (row.addonSlugs.length === 0) {
        const ids: string[] = [];
        const missing: string[] = [];
        for (const slug of target.addonSlugs) {
          const addon = stored.get(slug);
          if (addon) ids.push(addon.id);
          else missing.push(slug);
        }
        if (missing.length > 0) {
          blockers.push(`offering ${target.slug}: extra ${missing.join(', ')} is missing`);
        } else {
          linkIds = ids;
          changes.push(`extra's: + ${target.addonSlugs.join(', ')}`);
        }
      } else {
        blockers.push(
          `offering ${target.slug}: has its own extra's (${row.addonSlugs.join(', ')}) — not touched`,
        );
      }
    }
    const action: ExtrasPlanEntry['action'] =
      blockers.length > 0 ? 'blocked' : changes.length > 0 ? 'update' : 'none';
    return { slug: target.slug, action, stored: row, target, changes, blockers, columns, linkIds };
  });
  return { locale: deps.locale, entries, guards: await guardCountsExtras(deps) };
}

export function extrasBlockers(plan: ExtrasPlan): string[] {
  return plan.entries.flatMap((entry) => entry.blockers);
}

export function extrasHasChanges(plan: ExtrasPlan): boolean {
  return plan.entries.some((entry) => entry.action === 'update');
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

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export const aanbodExtrasBackupSchema = z.object({
  kind: z.literal('aanbod-extras-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  locale: z.string(),
  driver: z.string(),
  offerings: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      isAddon: z.boolean(),
      soldAlone: z.boolean(),
      addonMinutes: z.number().int().nullable(),
      addonIds: z.array(z.string()),
    }),
  ),
  guards: z.record(z.string(), z.unknown()),
});
export type AanbodExtrasBackup = z.infer<typeof aanbodExtrasBackupSchema>;

function buildBackup(plan: ExtrasPlan, driver: string): AanbodExtrasBackup {
  return aanbodExtrasBackupSchema.parse({
    kind: 'aanbod-extras-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    locale: plan.locale,
    driver,
    offerings: plan.entries
      .filter((entry) => entry.action === 'update' && entry.stored)
      .map((entry) => {
        const { id, slug, isAddon, soldAlone, addonMinutes, addonIds } = entry.stored!;
        return { id, slug, isAddon, soldAlone, addonMinutes, addonIds };
      }),
    guards: plan.guards,
  });
}

export async function readExtrasBackup(file: string): Promise<AanbodExtrasBackup> {
  const { readFile } = await import('node:fs/promises');
  return aanbodExtrasBackupSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

// ---------------------------------------------------------------------------
// Apply, verify, restore
// ---------------------------------------------------------------------------

export type AanbodExtrasApplyResult = { changed: boolean; backupPath: string | null };

async function writeLinks(deps: RolloutDeps, offeringId: string, addonIds: readonly string[]) {
  for (const [index, addonId] of addonIds.entries()) {
    await deps.db
      .insert(cmsOfferingAddons)
      .values({ offeringId, addonId, sortOrder: index })
      .onConflictDoUpdate({
        target: [cmsOfferingAddons.offeringId, cmsOfferingAddons.addonId],
        set: { sortOrder: index },
      });
  }
}

export async function applyAanbodExtras(
  deps: RolloutDeps,
  options: { backupDir: string; driver: string },
): Promise<AanbodExtrasApplyResult> {
  const { log } = deps;
  const { eq } = deps.orm;
  const plan = await planAanbodExtras(deps);
  const blockers = extrasBlockers(plan);
  if (blockers.length > 0) throw new Error(`patch refused:\n  - ${blockers.join('\n  - ')}`);
  if (!extrasHasChanges(plan)) {
    log('=', "nothing to do: the extra's of 20 Oct 2026 are already applied");
    return { changed: false, backupPath: null };
  }

  // 1. Backup FIRST. No backup, no write.
  const backup = buildBackup(plan, options.driver);
  const backupPath = await writeBackup(
    backup as unknown as Parameters<typeof writeBackup>[0],
    options.backupDir,
    'aanbod-extras-patch',
  );
  const backupFile = backupPath.split(/[\\/]/).pop() ?? backupPath;
  log('✓', `backup written: ${backupPath}`);

  // 2. The columns and the links, one offering at a time, each audited.
  const updated = plan.entries.filter((entry) => entry.action === 'update');
  for (const entry of updated) {
    const id = entry.stored!.id;
    if (entry.columns) {
      await deps.db
        .update(cmsOfferings)
        .set({ ...entry.columns, updatedBy: deps.actor.id, updatedAt: new Date() })
        .where(eq(cmsOfferings.id, id));
    }
    if (entry.linkIds) await writeLinks(deps, id, entry.linkIds);
    await deps.auth.recordAudit(deps.db, deps.actor, {
      action: 'offering.update',
      entityType: 'cms_offering',
      entityId: id,
      summary: `${entry.slug}: ${entry.changes.join('; ')} (patch aanbod-extras)`,
    });
    log('~', `offering ${entry.slug} — ${entry.changes.join('; ')}`);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });

  // 3. Verify, and check that no table gained or lost rows.
  const problems = await verifyAanbodExtras(deps);
  if (problems.length > 0) throw new Error(`verification failed:\n  - ${problems.join('\n  - ')}`);
  log('✓', 'offerings and the public catalogue verified');
  const after = await guardCountsExtras(deps);
  for (const key of ['offerings', 'services', 'bookings']) {
    if (after[key] !== plan.guards[key]) {
      throw new Error(`the ${key} table gained or lost rows during the patch!`);
    }
  }
  log('✓', 'offerings, services and bookings: no row added or removed');
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.aanbod-extras.apply',
    entityType: 'cms_rollout',
    summary: "extra's van het aanbod, 20 Oct 2026",
    metadata: { backup: backupFile, offerings: updated.map((entry) => entry.slug) },
  });
  return { changed: true, backupPath };
}

/** Invariants after an apply; an empty list means the extras are live as intended. */
export async function verifyAanbodExtras(deps: PlanDeps): Promise<string[]> {
  const plan = await planAanbodExtras(deps);
  const problems = [...extrasBlockers(plan)];
  if (extrasHasChanges(plan)) problems.push('a second plan still finds work');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const catalogue = await loadOfferCatalogue(deps.locale);
  for (const target of extrasTargets()) {
    const live = catalogue.bySlug[target.slug];
    if (!live) {
      problems.push(`offering ${target.slug} is not in the public catalogue`);
      continue;
    }
    if (!target.soldAlone && live.offering.status !== 'addon') {
      problems.push(`offering ${target.slug} should read as an extra only`);
    }
    if (target.addonSlugs.length === 0) continue;
    if (live.offering.bookingMode !== 'direct' || !live.offering.soldAlone) continue;
    for (const variant of live.offering.variants) {
      if (!variant.serviceId) continue;
      const offered = catalogue.addonsByService[variant.serviceId]?.length ?? 0;
      if (offered !== target.addonSlugs.length) {
        problems.push(
          `service of ${target.slug} (${variant.audience}) offers ${offered} extra's, expected ${target.addonSlugs.length}`,
        );
      }
    }
  }
  return problems;
}

export async function restoreAanbodExtras(deps: RolloutDeps, backup: AanbodExtrasBackup) {
  const { db, log } = deps;
  const { eq } = deps.orm;
  for (const entry of backup.offerings) {
    await db
      .update(cmsOfferings)
      .set({
        isAddon: entry.isAddon,
        soldAlone: entry.soldAlone,
        addonMinutes: entry.addonMinutes,
        updatedAt: new Date(),
      })
      .where(eq(cmsOfferings.id, entry.id));
    await db.delete(cmsOfferingAddons).where(eq(cmsOfferingAddons.offeringId, entry.id));
    await writeLinks(deps, entry.id, entry.addonIds);
    log('~', `offering ${entry.slug} — restored`);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });
}

// ---------------------------------------------------------------------------
// Mode dispatch (shared with the self-test)
// ---------------------------------------------------------------------------

export type AanbodExtrasRunOptions = { apply: boolean; restore: string | null; backupDir: string };

export async function runAanbodExtrasPatch(
  options: AanbodExtrasRunOptions,
  context: RolloutRunContext,
): Promise<void> {
  const { log } = context;
  const writing = options.apply || options.restore !== null;
  const schema = await import('@/db/cms-schema');
  const planDeps: PlanDeps = {
    db: writing ? context.db : readOnlyDb(context.db),
    orm: await import('drizzle-orm'),
    schema,
    blocks: await import('@/lib/cms/blocks'),
    locale: schema.DEFAULT_LOCALE,
    log,
  };
  // The write side is loaded before the first query (see the prices patch).
  const writeSide = writing
    ? { repo: await import('@/lib/cms/repo'), auth: await import('@/lib/cms/auth') }
    : null;
  const actor = await findActor(planDeps);

  if (!writing) {
    log('=', `would act as ${actor.email} (no session is created in a dry run)`);
    const plan = await planAanbodExtras(planDeps);
    printExtrasPlan(plan, log);
    const blockers = extrasBlockers(plan);
    for (const blocker of blockers) log('!', blocker);
    console.log('');
    const pending = extrasHasChanges(plan);
    log(
      pending ? '→' : '=',
      blockers.length > 0
        ? 'dry run: blocked — fix the items marked ! first'
        : pending
          ? 'dry run: run again with --apply to write'
          : 'dry run: nothing to do',
    );
    return;
  }

  await withAdminSession(context, actor.id, 'cms-patch-aanbod-extras', async () => {
    const deps: RolloutDeps = { ...planDeps, ...writeSide!, actor };
    if (options.restore !== null) {
      const backup = await readExtrasBackup(options.restore);
      if (backup.locale !== deps.locale) {
        throw new Error(`backup is for locale ${backup.locale}, database runs ${deps.locale}`);
      }
      await restoreAanbodExtras(deps, backup);
      log('✓', 'restore complete');
      return;
    }
    const result = await applyAanbodExtras(deps, {
      backupDir: options.backupDir,
      driver: context.driver,
    });
    log(result.changed ? '✓' : '=', result.changed ? 'apply complete' : 'nothing written');
  });
}
